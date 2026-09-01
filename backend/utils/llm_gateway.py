import os
from google import genai
from google.genai import types
import openai
import httpx
import json

class LLMGateway:
    """
    Low-level Driver for LLM Providers (Google & OpenAI).
    Handles authentication, client creation, and raw API calls.
    Enforces JSON generation and generic error handling.
    """
    
    @staticmethod
    def _get_google_client(api_key):
        # Ensure pure client init
        return genai.Client(api_key=api_key)
        
    @staticmethod
    def _get_openai_client(api_key, base_url):
        # Explicitly use a clean httpx client to avoid environmental pollution or proxy args issues
        # occurring in implicit default client creation.
        http_client = httpx.Client(timeout=httpx.Timeout(600.0))
        return openai.OpenAI(api_key=api_key, base_url=base_url, http_client=http_client)

    def _retry_wrapper(self, func_name, func, *args, **kwargs):
        """
        Internal Retryer for Network Resilience.
        Retries: 2 times (Total 3 attempts).
        Delay: 1s, 2s.
        Catch: SSL, Connection, Timeout errors.
        """
        import time
        import ssl
        
        max_retries = 2
        for attempt in range(max_retries + 1):
            try:
                return func(*args, **kwargs)
            except (ssl.SSLEOFError, ssl.SSLError, httpx.ReadError, httpx.ConnectError, httpx.TimeoutException) as e:
                is_retryable = True
                
                if is_retryable and attempt < max_retries:
                    wait_time = (attempt + 1) * 1.5
                    print(f"⚠️ [LLM Gateway] Network Error ({type(e).__name__}) during {func_name}. Retrying ({attempt+1}/{max_retries}) in {wait_time}s...")
                    time.sleep(wait_time)
                    continue
                
                # If exhausted or unknown error, re-raise
                print(f"❌ [LLM Gateway] Failed after {attempt} retries: {str(e)}")
                raise e

    def call_google(self, api_key, model_name, contents, system_instruction=None, 
                   thinking_config=None, temperature=0.7, cached_content=None,
                   response_schema=None):
        """
        Execute Google GenAI request.
        
        Args:
            response_schema: Optional JSON schema dict for structured output.
        """
        client = self._get_google_client(api_key)
        
        # Config
        gen_config = types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=temperature
        )
        
        # Setup attributes
        if thinking_config:
            gen_config.thinking_config = thinking_config
            
        if system_instruction:
            gen_config.system_instruction = system_instruction
            
        if cached_content:
            gen_config.cached_content = cached_content
            
        if response_schema:
            gen_config.response_schema = response_schema
            schema_fields = list(response_schema.get('items', {}).get('properties', {}).keys())
            print(f"🔒 [Schema] Using response_schema: {schema_fields}")
            
        # Execute with Retry
        return self._retry_wrapper(
            "call_google",
            client.models.generate_content,
            model=model_name,
            contents=contents,
            config=gen_config
        )

    def call_openai(self, api_key, base_url, model_name, messages, temperature=0.7, response_schema=None, extra_body=None):
        """
        Execute OpenAI/Compatible request.
        
        Args:
            response_schema: Optional JSON schema dict for structured output.
                            Uses OpenAI's json_schema format if supported.
            extra_body: Optional dict of provider-specific body params (e.g.
                        {"enable_thinking": False} for DashScope/Qwen).
        """
        client = self._get_openai_client(api_key, base_url)
        
        # Build response_format based on schema presence
        if response_schema:
            # Use OpenAI Structured Outputs (json_schema format)
            # Note: Requires gpt-4o-mini-2024-07-18 or newer, or compatible API
            response_format = {
                "type": "json_schema",
                "json_schema": {
                    "name": "structured_output",
                    "schema": response_schema,
                    "strict": True
                }
            }
            schema_fields = list(response_schema.get('properties', {}).keys())
            print(f"🔒 [OpenAI Schema] Using response_schema: {schema_fields}")
        else:
            response_format = {"type": "json_object"}
        
        # Standard Chat Completion
        kwargs = {
            "model": model_name,
            "messages": messages,
            "temperature": temperature,
            "response_format": response_format,
        }
        if extra_body:
            kwargs["extra_body"] = extra_body
        
        return self._retry_wrapper(
            "call_openai",
            client.chat.completions.create,
            **kwargs
        )
