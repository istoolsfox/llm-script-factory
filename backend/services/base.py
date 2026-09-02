import os
from typing import Optional, Dict, Any, Union, List
from utils.llm_manager import LLMManager
from utils.prompt_manager import PromptManager
from utils.file_manager import FileManager
from utils.debug_manager import DebugManager
from services.project_service import ProjectService

class BaseService:
    """
    Base Service Class (Stage 1-6).
    Encapsulates common infrastructure for LLM requests and Data Persistence.
    Enforces isolation between Cached and Non-Cached logic.
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
    # 3. CACHE MANAGEMENT (Common Service)
    # -------------------------------------------------------------------------
    def ensure_cache(
        self,
        model_key: str,
        display_name: str,
        system_content: str,
        context_contents: List[str],
        ttl_seconds: int = 600
    ) -> str:
        """
        Get existing cache by display_name or create a new one.
        Standardizes API Key retrieval, Creation, logging for all Stages.
        Enforces Idempotency: If a cache with the same name exists, reuse it.
        """
        config = self.llm.get_model_config(model_key)
        api_key = os.getenv(config.get("api_key_env"))
        model_name = config.get("model_name")

        if not api_key:
            raise ValueError(f"API Key not found for {model_key}")

        from utils.cache_manager import CacheManager
        
        # 1. Check Existing (Idempotency)
        existing_caches = CacheManager.list_caches(api_key)
        for c in existing_caches:
            if c.display_name == display_name:
                print(f"✅ Found existing cache: {c.name} ({display_name})")
                return c.name

        # 2. Create New
        print(f"🚀 Creating Cache: {display_name} (TTL: {ttl_seconds}s)")
        cache_name = CacheManager.create_cache(
            api_key=api_key,
            model_name=model_name,
            display_name=display_name,
            system_instruction=system_content,
            context_contents=context_contents,
            ttl_seconds=ttl_seconds
        )

        # 3. Log (Full content for debugging)
        context_full = "\n\n---\n\n".join(context_contents)
        DebugManager.log_interaction(
            model_key="System (CacheBuilder)",
            prompt=context_full,  # Full context content
            system=system_content,  # Full system content (no truncation)
            response=f"Success. Resource Name: {cache_name}",
            token_usage={"input": sum(len(c) for c in context_contents)//4, "output": 0},
            cache_hit=False,
            source=f"cache_build/{display_name}"
        )

        return cache_name

    # -------------------------------------------------------------------------
    # 1. REQUEST HANDLING (Isolated Logic)
    # -------------------------------------------------------------------------
    def process_request(
        self,
        model_key: str,
        user_content: str,
        system_content: Optional[str] = None,
        context_content: Optional[str] = None,
        cache_name: Optional[str] = None,
        temperature: float = 0.7,
        source: Optional[str] = None,
        response_schema: Optional[Dict] = None
    ) -> Any:
        """
        Unified Entry Point for LLM Generation.
        Dispatches to isolated internal methods based on cache presence.

        Args:
            model_key: Model identifier from config.
            user_content: Rendered User Prompt (Dynamic Part).
            system_content: Rendered System Prompt (Optional).
            context_content: Rendered Context (DTG/Examples) for injection (Optional).
            cache_name: Gemini Context Cache Resource Name (Optional).
            temperature: Generation temperature.
            source: Source identifier for debug logging (e.g. "stage1/synopsis").
            response_schema: Optional JSON schema dict for structured output (Google only).
        """
        if cache_name:
            return self._execute_cached_request(
                model_key=model_key,
                user_content=user_content,
                cache_name=cache_name,
                temperature=temperature,
                source=source,
                response_schema=response_schema
            )
        return self._execute_standard_request(
            model_key=model_key,
            user_content=user_content,
            system_content=system_content,
            context_content=context_content,
            temperature=temperature,
            source=source,
            response_schema=response_schema
        )

    # -------------------------------------------------------------------------
    # 1.1 CONFIG AWARE REQUEST (Enforces Server-Side Truth)
    # -------------------------------------------------------------------------
    def process_aware_request(
        self,
        project_name: str,
        stage_id: str,
        user_content: str,
        system_content: Optional[str] = None,
        context_content: Optional[str] = None,
        # Overrides allowed but discouraged generally, logic below prioritizes file
    ) -> Any:
        """
        Policy Enforced Execution:
        1. Reads settings.json for 'project_name'.
        2. extracts config for 'stage_id' (e.g. "stage1").
        3. uses those params to call process_request.
        """
        # 1. Load Settings
        settings = self.projects.get_settings(project_name)
        
        # 2. Resolve Stage Config
        # Frontend saves stage specifics under keys like "stage1". 
        # Global defaults might be at root.
        # Fallback hierarchy: Stage Specific -> Global Root -> Hardcoded Defaults
        stage_cfg = settings.get(stage_id, {})
        
        # Helper to get value with fallback
        def get_val(key, default=None):
            # Check stage strictly first
            if key in stage_cfg: return stage_cfg[key]
            # Check root settings (global fallback)
            if key in settings: return settings[key]
            return default

        model_key = get_val("model")
        if not model_key:
            raise ValueError(f"⚠️ 未检测到模型配置 ({stage_id})。请先在左侧侧边栏 'AI Configuration' 中设置模型参数。")

        temperature = float(get_val("temperature", 0.7))
        use_cache = get_val("useCache", False)
        cache_name = get_val("cacheName", None)
        
        # 🔧 CRITICAL: Model choice is the SOLE routing authority.
        # Cache is ONLY supported by Google provider. If user selected a non-Google model,
        # forcefully disable cache to prevent silent fallback to Gemini.
        model_cfg = self.llm.get_model_config(model_key)
        provider = model_cfg.get("provider")
        
        if provider != "google" and use_cache:
            print(f"⚠️ Cache disabled: Provider '{provider}' does not support caching. Using direct API call.")
            use_cache = False
            cache_name = None
        
        # If cache is disabled in settings, forcefully ignore cache_name even if present
        resolved_cache_name = cache_name if use_cache else None
        
        # 3. Log Choice
        print(f"⚙️ Config for {project_name}/{stage_id}: Model={model_key}, Provider={provider}, Temp={temperature}, Cache={resolved_cache_name}")
        
        # 4. Execute with source tracking
        return self.process_request(
            model_key=model_key,
            user_content=user_content,
            system_content=system_content,
            context_content=context_content,
            cache_name=resolved_cache_name,
            temperature=temperature,
            source=f"{stage_id}/generate"
        )

    def _execute_cached_request(
        self, 
        model_key: str, 
        user_content: str, 
        cache_name: str, 
        temperature: float,
        source: Optional[str] = None,
        response_schema: Optional[Dict] = None
    ) -> Any:
        """
        Internal: Handle Cached Request.
        Constraint: NO System Prompt allowed (baked in cache).
        Constraint: NO Context Injection allowed (baked in cache).
        """
        return self.llm.generate_json(
            model_key=model_key,
            prompt=user_content,
            system_instruction=None, # Forced None
            cache_name=cache_name,
            temperature=temperature,
            source=source,
            response_schema=response_schema
        )

    def _execute_standard_request(
        self, 
        model_key: str, 
        user_content: str, 
        system_content: Optional[str], 
        context_content: Optional[str], 
        temperature: float,
        source: Optional[str] = None,
        response_schema: Optional[Dict] = None
    ) -> Any:
        """
        Internal: Handle Standard (NoCache) Request.
        Logic: Combine Context + User -> Full Prompt.
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
