import os
import json
import re
from pathlib import Path
import yaml
from google.genai import types
from .llm_gateway import LLMGateway
from .debug_manager import DebugManager

class LLMManager:
    """
    High-level Orchestrator for LLM interactions.
    Manages Configuration, Strategy Selection (Cache vs NoCache), and Response Parsing.
    """
    
    def __init__(self):
        self.gateway = LLMGateway()
        self.config = self._load_config()

    def _load_config(self):
        config_path = Path(__file__).resolve().parent.parent / "config" / "models.yaml"
        try:
            with config_path.open("r", encoding="utf-8") as f:
                return yaml.safe_load(f)
        except Exception:
            return {}

    def get_model_config(self, model_key):
        models = self.config.get("models", {})
        if model_key not in models:
            raise ValueError(f"Model key '{model_key}' not defined in models.yaml")
        return models[model_key]

    def _clean_json_string(self, text):
        """Standard JSON cleaner: remove markdown code blocks."""
        if not text: return "{}"
        cleaned = text.strip()
        # Remove ```json ... ```
        if "```" in cleaned:
            pattern = r"```(?:json)?\s*(.*?)\s*```"
            match = re.search(pattern, cleaned, re.DOTALL)
            if match:
                cleaned = match.group(1)
        return cleaned

    def _get_thinking_config(self, model_cfg):
        """Helper to construct ThinkingConfig from model settings."""
        level = model_cfg.get("thinking_level")
        if not level:
            return None
        
        # level: "high" -> include_thoughts=True
        # level: "low"  -> include_thoughts=False (but still thinking)
        return types.ThinkingConfig(include_thoughts=(level == "high"))

    def generate_json(self, model_key, prompt, system_instruction=None, cache_name=None, temperature=0.7, source=None, response_schema=None):
        """
        Unified Entry Point for JSON Generation.
        
        Args:
            model_key (str): Defined in models.yaml
            prompt (str): User prompt
            system_instruction (str): System prompt (Ignored in Cache Mode)
            cache_name (str, optional): Google Cache Resource Name. If present, strictly uses Cache Strategy.
            temperature (float): Generation temperature.
            source (str, optional): Source identifier for debug logging (e.g. "stage1/synopsis").
            response_schema (dict, optional): JSON schema for structured output (Google only).
        """
        model_cfg = self.get_model_config(model_key)
        provider = model_cfg.get("provider")
        
        # ROUTING STRATEGY
        # Note: Cache mode should only be reached for Google provider models.
        # The upstream BaseService.process_aware_request() enforces this by disabling
        # cache for non-Google providers. This assertion is a defensive safeguard.
        if cache_name:
            assert provider == "google", f"BUG: Cache mode reached with non-Google provider '{provider}'. This should be blocked upstream."
            return self._execute_cache_strategy(model_cfg, prompt, cache_name, temperature, source, response_schema)
        else:
            return self._execute_standard_strategy(model_cfg, prompt, system_instruction, temperature, source, response_schema)

    # -------------------------------------------------------------------------
    # STRATEGY 1: CACHE MODE (Google Isolated)
    # -------------------------------------------------------------------------
    def _execute_cache_strategy(self, model_cfg, prompt, cache_name, temperature, source=None, response_schema=None):
        """
        Strict Execution Path for Cached Requests.
        NO System Prompt is allowed (baked in cache).
        """
        api_key_env = model_cfg.get("api_key_env")
        api_key = os.getenv(api_key_env)
        model_name = model_cfg.get("model_name")
        
        # Validate API Key
        if not api_key:
            raise ValueError(
                f"❌ API Key 未配置: {api_key_env}\n"
                f"请在 Settings > API Keys 中配置对应的 Key，或在 .env 文件中添加 {api_key_env}=你的密钥"
            )
        
        # Prepare Thinking Config
        t_config = self._get_thinking_config(model_cfg)

        try:
            # GATEWAY CALL
            response = self.gateway.call_google(
                api_key=api_key,
                model_name=model_name,
                contents=prompt, # User prompt only
                system_instruction=None, # FORCED None
                cached_content=cache_name,
                thinking_config=t_config,
                temperature=temperature,
                response_schema=response_schema
            )
            
            # PARSE
            raw_text = response.text
            cleaned_text = self._clean_json_string(raw_text)
            json_obj = json.loads(cleaned_text)
            
            # VERIFY CACHE HIT (from API response)
            cached_token_count = getattr(response.usage_metadata, 'cached_content_token_count', 0) or 0
            actual_cache_hit = cached_token_count > 0
            
            # LOGGING
            usage = {"input": response.usage_metadata.prompt_token_count, 
                     "output": response.usage_metadata.candidates_token_count,
                     "cached": cached_token_count}  # Add cached token count to usage
            DebugManager.log_interaction(
                model_key=model_cfg.get("description", "Google Cache Model"),
                prompt=prompt, # Keep full prompt
                system=f"[Built-in Cache] cached_tokens={cached_token_count}",
                response=json_obj,
                token_usage=usage,
                cache_hit=actual_cache_hit,  # True only if API confirms cache was used
                raw_response=raw_text,
                source=source
            )
            
            return json_obj
            
        except Exception as e:
            # Check for 404 or NotFound in error message
            # Google API usually raises google.api_core.exceptions.NotFound
            if "404" in str(e) or "Not Found" in str(e) or "not find" in str(e).lower():
                raise ValueError("缓存已失效或不存在 (404)。请点击 '🛠️ 建立缓存' 按钮重新生成缓存。")
            
            DebugManager.log_interaction(
                model_key="CacheError", prompt=prompt[:50], system=None, response=None, error=str(e), source=source
            )
            raise e

    # -------------------------------------------------------------------------
    # STRATEGY 2: STANDARD MODE (NoCache)
    # -------------------------------------------------------------------------
    def _execute_standard_strategy(self, model_cfg, prompt, system_instruction, temperature, source=None, response_schema=None):
        """
        Standard Execution Path for Full Injection.
        Supports both Google and OpenAI.
        """
        provider = model_cfg.get("provider")
        api_key_env = model_cfg.get("api_key_env")
        api_key = os.getenv(api_key_env)
        model_name = model_cfg.get("model_name")
        
        # Validate API Key
        if not api_key:
            raise ValueError(
                f"❌ API Key 未配置: {api_key_env}\n"
                f"请在 Settings > API Keys 中配置对应的 Key，或在 .env 文件中添加 {api_key_env}=你的密钥"
            )
        
        raw_text = ""
        usage = {}
        
        try:
            if provider == "google":
                # Google Logic
                t_config = self._get_thinking_config(model_cfg)
                
                response = self.gateway.call_google(
                    api_key=api_key,
                    model_name=model_name,
                    contents=prompt,
                    system_instruction=system_instruction,
                    thinking_config=t_config,
                    temperature=temperature,
                    response_schema=response_schema
                )
                raw_text = response.text
                usage = {"input": response.usage_metadata.prompt_token_count, 
                         "output": response.usage_metadata.candidates_token_count}
                         
            elif provider == "openai":
                # OpenAI Logic
                base_url = model_cfg.get("base_url")
                messages = []
                if system_instruction:
                    messages.append({"role": "system", "content": system_instruction})
                messages.append({"role": "user", "content": prompt})
                
                # Provider-specific extra body params (e.g. DashScope enable_thinking)
                extra_body = None
                if "enable_thinking" in model_cfg:
                    extra_body = {"enable_thinking": model_cfg.get("enable_thinking")}
                
                response = self.gateway.call_openai(
                    api_key=api_key,
                    base_url=base_url,
                    model_name=model_name,
                    messages=messages,
                    temperature=temperature,
                    response_schema=None, # response_schema # DeepSeek 不支持 response_format，暂时禁用
                    extra_body=extra_body
                )
                
                raw_text = response.choices[0].message.content
                # OpenAI usage mapping
                u = response.usage
                usage = {"input": u.prompt_tokens, "output": u.completion_tokens}
                
            else:
                raise ValueError(f"Unsupported provider: {provider}")
                
            # PARSE
            cleaned_text = self._clean_json_string(raw_text)
            json_obj = json.loads(cleaned_text)
            
            # LOGGING
            DebugManager.log_interaction(
                model_key=model_cfg.get("description", provider),
                prompt=prompt,
                system=system_instruction if system_instruction else "None",
                response=json_obj,
                token_usage=usage,
                cache_hit=False,
                raw_response=raw_text,
                source=source
            )
            
            return json_obj
            
        except Exception as e:
            DebugManager.log_interaction(
                model_key=f"Error_{provider}", prompt=prompt[:50], system=None, response=None, error=str(e), source=source
            )
            raise e
