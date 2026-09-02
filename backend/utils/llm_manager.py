import os
import json
import re
from pathlib import Path
import yaml
from .llm_gateway import LLMGateway
from .debug_manager import DebugManager

class LLMManager:
    """
    High-level Orchestrator for LLM interactions.
    Manages Configuration and Response Parsing for OpenAI-compatible providers.
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

    def generate_json(self, model_key, prompt, system_instruction=None, temperature=0.7, source=None, response_schema=None):
        """
        Unified Entry Point for JSON Generation.

        Args:
            model_key (str): Defined in models.yaml
            prompt (str): User prompt
            system_instruction (str): System prompt
            temperature (float): Generation temperature.
            source (str, optional): Source identifier for debug logging (e.g. "stage1/synopsis").
            response_schema (dict, optional): JSON schema. Only sent to the API when the
                model config sets `supports_json_schema: true`; otherwise the request
                uses json_object mode and the schema is enforced by prompt only.
        """
        model_cfg = self.get_model_config(model_key)
        return self._execute_standard_strategy(model_cfg, prompt, system_instruction, temperature, source, response_schema)

    # -------------------------------------------------------------------------
    # STANDARD MODE
    # -------------------------------------------------------------------------
    def _execute_standard_strategy(self, model_cfg, prompt, system_instruction, temperature, source=None, response_schema=None):
        """Standard Execution Path for OpenAI-compatible providers."""
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

        usage = {}

        try:
            base_url = model_cfg.get("base_url")
            messages = []
            if system_instruction:
                messages.append({"role": "system", "content": system_instruction})
            messages.append({"role": "user", "content": prompt})

            # Provider-specific extra body params (e.g. DashScope enable_thinking)
            extra_body = None
            if "enable_thinking" in model_cfg:
                extra_body = {"enable_thinking": model_cfg.get("enable_thinking")}

            # Structured output only when the model config opts in; json_object
            # mode is the safe default across OpenAI-compatible providers.
            effective_schema = response_schema if model_cfg.get("supports_json_schema") else None

            response = self.gateway.call_openai(
                api_key=api_key,
                base_url=base_url,
                model_name=model_name,
                messages=messages,
                temperature=temperature,
                response_schema=effective_schema,
                extra_body=extra_body
            )

            raw_text = response.choices[0].message.content
            # OpenAI usage mapping
            u = response.usage
            usage = {"input": u.prompt_tokens, "output": u.completion_tokens}

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
