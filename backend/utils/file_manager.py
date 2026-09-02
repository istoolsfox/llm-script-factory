import os
import json
import time
from typing import Optional, Dict, Any, Tuple

# Last snapshot per project path to avoid excessive snapshots on rapid writes.
_last_snapshot = {}

class FileManager:
    """
    Centralized I/O Controller.
    Refactored for FastAPI Backend (Stateless).
    """
    
    @staticmethod
    def load_json(path: str, default: Optional[Any] = None) -> Any:
        """
        Load JSON from absolute path.
        """
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                print(f"Error loading JSON from {path}: {e}")
                return default
        return default

    @staticmethod
    def _maybe_auto_snapshot(path: str):
        """
        If the path is inside a project dir, auto-snapshot that project before
        overwriting (so every save creates a version). Rate-limited per project
        (max 1 snapshot / 5s) to avoid bloat on rapid iterative saves.
        """
        try:
            marker = "/projects/"
            idx = path.find(marker)
            if idx < 0:
                return
            # project_name is the path segment right after /projects/
            rest = path[idx + len(marker):]
            name = rest.split(os.sep)[0]
            if not name:
                return
            now = time.time()
            if _last_snapshot.get(name) and now - _last_snapshot[name] < 5:
                return
            from services.version_service import VersionService
            meta = VersionService().snapshot(name, tag="auto_save")
            if meta:
                _last_snapshot[name] = now
        except Exception as e:
            print(f"[auto-snapshot] skipped: {e}")

    @staticmethod
    def save_json(path: str, data: Any) -> bool:
        """
        Save JSON to absolute path.
        Auto-creates directories and snapshots the project before overwrite.
        """
        try:
            FileManager._maybe_auto_snapshot(path)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            return True
        except Exception as e:
            print(f"Error saving JSON to {path}: {e}")
            return False

    @staticmethod
    def validate_json(data: Any, schema_path_relative: str) -> Tuple[bool, str]:
        """
        Validate data against a schema file.
        schema_path_relative: path relative to backend root (e.g. 'prompts/stage1/schema_step1.json')
        """
        # Resolve schema path relative to backend root
        backend_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        schema_path = os.path.join(backend_root, schema_path_relative)

        if not os.path.exists(schema_path):
             return False, f"Schema file not found: {schema_path}"
             
        try:
            with open(schema_path, "r", encoding="utf-8") as f:
                schema = json.load(f)
            return FileManager._validate_schema_logic(data, schema)
        except Exception as e:
            return False, f"Validation Error: {str(e)}"

    @staticmethod
    def _validate_schema_logic(data: Any, schema: Any) -> Tuple[bool, str]:
        """
        Custom recursive validator.
        Supports basic type checking and required fields.
        """
        if not isinstance(schema, dict):
            return True, "Valid"

        schema_type = schema.get("type")
        allowed_types = schema_type if isinstance(schema_type, list) else [schema_type] if schema_type else []

        def is_valid_primitive(expected_type: str, value: Any) -> bool:
            if expected_type == "string":
                return isinstance(value, str)
            if expected_type == "number":
                return isinstance(value, (int, float)) and not isinstance(value, bool)
            if expected_type == "integer":
                return isinstance(value, int) and not isinstance(value, bool)
            if expected_type == "boolean":
                return isinstance(value, bool)
            if expected_type == "null":
                return value is None
            return False

        # 1. Handle Array Type
        if "array" in allowed_types or schema_type == "array":
            if isinstance(data, list):
                item_schema = schema.get("items")
                if item_schema:
                    for idx, item in enumerate(data):
                        valid, msg = FileManager._validate_schema_logic(item, item_schema)
                        if not valid:
                            return False, f"Item {idx}: {msg}"
                return True, "Valid"
            if allowed_types:
                return False, "Expected a list (array), got something else."

        # 2. Handle Object Type
        if "object" in allowed_types or schema_type == "object":
            if not isinstance(data, dict):
                return False, "Expected an object, got something else."

        # 3. Handle Primitive Types
        primitive_types = {"string", "number", "integer", "boolean", "null"}
        if allowed_types and any(t in primitive_types for t in allowed_types):
            if any(is_valid_primitive(t, data) for t in allowed_types if t in primitive_types):
                return True, "Valid"
            return False, f"Expected type {allowed_types}, got {type(data).__name__}."

        # Check required fields for objects
        if isinstance(data, dict):
            if "required" in schema and isinstance(schema["required"], list):
                for req in schema["required"]:
                    if req not in data:
                        return False, f"Missing required field: '{req}'"
            
            # Recursive check for properties
            properties = schema.get("properties")
            if properties and isinstance(properties, dict):
                for key, prop_schema in properties.items():
                    if key in data:
                        valid, msg = FileManager._validate_schema_logic(data[key], prop_schema)
                        if not valid:
                            return False, f"Key '{key}': {msg}"

        return True, "Valid"
