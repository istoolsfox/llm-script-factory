import os
import json
import shutil
import datetime
from typing import List, Dict, Optional

class ProjectService:
    """
    Service for managing Project lifecycle (Create, List, Delete) and Settings.
    """
    
    def __init__(self):
        # backend is at /.../backend
        # projects is at /.../backend/projects (sibling of services)
        self.root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../projects"))
        self.files = None  # Lazy load or direct json usage

    def get_project_path(self, project_name: str) -> Optional[str]:
        """Public helper to get absolute path of a project. Raises ValueError if missing/invalid."""
        if not project_name or ".." in project_name or "/" in project_name or "\\" in project_name:
             raise ValueError(f"项目名非法: {project_name!r}")
        path = os.path.join(self.root_dir, project_name)
        if not os.path.exists(path):
            raise ValueError(f"项目 '{project_name}' 不存在")
        return path

    def list_projects(self) -> List[Dict]:
        """Scan projects directory and return metadata."""
        if not os.path.exists(self.root_dir):
            os.makedirs(self.root_dir)
            
        projects = []
        for name in os.listdir(self.root_dir):
            if name.startswith(".") or name in ["__pycache__"]:
                continue
                
            path = os.path.join(self.root_dir, name)
            if os.path.isdir(path):
                # Basic metadata
                stats = os.stat(path)
                # Check stages progress (simple existence check)
                stages = {
                    "1_idea": os.path.exists(os.path.join(path, "1_ideas")),
                    "2_structure": os.path.exists(os.path.join(path, "2_structure")),
                    "3_scene": os.path.exists(os.path.join(path, "3_scripts")),
                    "4_script": os.path.exists(os.path.join(path, "4_scripts")),
                    "5_refine": os.path.exists(os.path.join(path, "5_scripts")),
                    "6_doctor": os.path.exists(os.path.join(path, "6_scripts")),
                }
                
                projects.append({
                    "name": name,
                    "path": path,
                    "updated_at": datetime.datetime.fromtimestamp(stats.st_mtime).isoformat(),
                    "stages": stages
                })
        
        # Sort by updated_at desc
        projects.sort(key=lambda x: x["updated_at"], reverse=True)
        return projects

    def create_project(self, name: str, description: str = "") -> str:
        """Create a new project folder (main directory only).
        
        Returns:
            The sanitized project name that was actually created.
        """
        if not name:
            raise ValueError("Project name cannot be empty")
            
        # Sanitize name (remove special chars except Chinese/Japanese/Korean characters)
        # Keep: alphanumeric, CJK chars, space, underscore, dash
        safe_name = "".join([
            c for c in name 
            if c.isalnum() or c in " _-" or '\u4e00' <= c <= '\u9fff'  # CJK range
        ]).strip()
        
        if not safe_name:
            raise ValueError("Project name contains no valid characters")
            
        target_path = os.path.join(self.root_dir, safe_name)
        
        if os.path.exists(target_path):
            raise ValueError(f"Project '{safe_name}' already exists")
            
        os.makedirs(target_path)
        # Subfolders will be created by each stage when needed
        return safe_name

    def delete_project(self, name: str) -> bool:
        """Delete a project and all its contents permanently."""
        # Security: Prevent directory traversal
        if not name or ".." in name or "/" in name or "\\" in name:
            raise ValueError("Invalid project name")
        
        project_path = os.path.join(self.root_dir, name)
        
        if not os.path.exists(project_path):
            raise ValueError(f"Project '{name}' does not exist")
        
        if not os.path.isdir(project_path):
            raise ValueError(f"'{name}' is not a valid project directory")
        
        # Use shutil.rmtree to recursively delete the directory
        shutil.rmtree(project_path)
        return True

    def get_settings(self, project_name: str) -> Dict:
        """Load project settings or return defaults."""
        # Use name directly but prevent directory traversal
        if ".." in project_name or "/" in project_name or "\\" in project_name:
             print(f"Invalid project name: {project_name}")
             return {}
             
        path = os.path.join(self.root_dir, project_name, "settings.json")
        
        if not os.path.exists(path):
            return {}
            
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading settings for {project_name}: {e}")
            return {}

    def save_settings(self, project_name: str, settings: Dict) -> bool:
        """Save complete settings to project (full replace)."""
        # Security check
        if ".." in project_name or "/" in project_name or "\\" in project_name:
            raise ValueError("Invalid project name")
            
        project_dir = os.path.join(self.root_dir, project_name)
        
        if not os.path.exists(project_dir):
            raise ValueError("Project does not exist")
            
        path = os.path.join(project_dir, "settings.json")
        
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(settings, f, indent=2, ensure_ascii=False)
            return True
        except Exception as e:
            raise ValueError(f"Failed to save settings: {e}")

    def update_settings(self, project_name: str, updates: Dict) -> Dict:
        """Update project settings (merge with existing)."""
        # Security check
        if ".." in project_name or "/" in project_name or "\\" in project_name:
            raise ValueError("Invalid project name")
            
        project_dir = os.path.join(self.root_dir, project_name)
        
        if not os.path.exists(project_dir):
            raise ValueError("Project does not exist")
            
        path = os.path.join(project_dir, "settings.json")
        
        # Load existing
        current = self.get_settings(project_name)
        
        # Deep merge for stages? Or just top-level merge?
        # Requirement: "Updates specific stage config". 
        # Typically frontend sends full object for a stage? Or generic partial.
        # Let's do a top-level recursive merge for safety if needed, 
        # but for now a simple dictionary update for top keys (stages) is likely enough 
        # unless we need partial updates INSIDE a stage config.
        # Implementation: Recursive merge is safer for "partial updates".
        
        def deep_update(d, u):
            for k, v in u.items():
                if isinstance(v, dict):
                    d[k] = deep_update(d.get(k, {}), v)
                else:
                    d[k] = v
            return d

        new_settings = deep_update(current, updates)
        
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(new_settings, f, indent=2, ensure_ascii=False)
            return new_settings
        except Exception as e:
            raise ValueError(f"Failed to save settings: {e}")
