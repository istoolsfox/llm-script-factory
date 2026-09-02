from typing import Optional, Dict, Any
from utils.llm_manager import LLMManager
from utils.prompt_manager import PromptManager
from utils.file_manager import FileManager
from utils.debug_manager import DebugManager
from services.project_service import ProjectService

class BaseService:
    """
    Base Service Class (Stage 1-6).
    Encapsulates common infrastructure for LLM requests and Data Persistence.
    """

    def __init__(self):
        self.llm = LLMManager()
        self.prompts = PromptManager()
        self.files = FileManager()
        self.projects = ProjectService()

    # Default model fallback so generation works even without per-stage config.
    DEFAULT_MODEL_KEY = "qwen3.8-flash"

    def resolve_model_key(self, project_name: str, stage_id: str):
        """
        Resolve the model key for a stage from project settings.
        Falls back to the default model (qwen3.8-flash) when unset, so users
        never hit 'please configure model' errors.
        Returns (model_key, temperature).
        """
        settings = self.projects.get_settings(project_name)
        stage_cfg = settings.get(stage_id, {})
        model_key = stage_cfg.get("model") or self.DEFAULT_MODEL_KEY
        temperature = float(stage_cfg.get("temperature", 0.7))
        return model_key, temperature

    # -------------------------------------------------------------------------
    # 1. REQUEST HANDLING
    # -------------------------------------------------------------------------
    def process_request(
        self,
        model_key: str,
        user_content: str,
        system_content: Optional[str] = None,
        context_content: Optional[str] = None,
        temperature: float = 0.7,
        source: Optional[str] = None,
        response_schema: Optional[Dict] = None
    ) -> Any:
        """
        Unified Entry Point for LLM Generation.

        Args:
            model_key: Model identifier from config.
            user_content: Rendered User Prompt (Dynamic Part).
            system_content: Rendered System Prompt (Optional).
            context_content: Rendered Context (DTG/Examples) for injection (Optional).
            temperature: Generation temperature.
            source: Source identifier for debug logging (e.g. "stage1/synopsis").
            response_schema: Optional JSON schema dict (sent only if the model
                config opts into structured output).
        """
        full_prompt = user_content

        # Inject Context if present (usually DTG or Examples)
        # Standard Pattern: Context \n\n User
        if context_content:
            full_prompt = f"{context_content}\n\n{user_content}"

        return self.llm.generate_json(
            model_key=model_key,
            prompt=full_prompt,
            system_instruction=system_content,
            temperature=temperature,
            source=source,
            response_schema=response_schema
        )

    # -------------------------------------------------------------------------
    # 2. JSON PERSISTENCE (Save & Validate)
    # -------------------------------------------------------------------------
    def save_validated_json(
        self,
        relative_path: str,
        data: Any,
        schema_path: str
    ) -> bool:
        """
        Save JSON data with mandatory Schema Validation.

        Args:
            relative_path: Path relative to project root (e.g. '1_ideas/data.json')
            data: The JSON serializable data.
            schema_path: Path to schema file (e.g. 'prompts/schema.json')

        Raises:
            ValueError: If validation fails.
        """
        # 1. Validate
        valid, msg = self.files.validate_json(data, schema_path)
        if not valid:
            # Log error for debugging
            DebugManager.log_interaction(
                model_key="SchemaValidation",
                prompt=f"Save {relative_path}",
                system="Validation",
                response="Failed",
                error=msg
            )
            raise ValueError(f"Schema Validation Failed: {msg}")

        # 2. Save
        return self.files.save_json(relative_path, data)
