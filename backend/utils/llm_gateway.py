import threading

import httpx
import openai

# Shared connection pool, reused across calls so sockets don't pile up during
# long batch generations. httpx.Client is thread-safe for concurrent requests.
_HTTP_CLIENT_LOCK = threading.Lock()
_HTTP_CLIENT = None


def _get_shared_http_client() -> httpx.Client:
    global _HTTP_CLIENT
    with _HTTP_CLIENT_LOCK:
        if _HTTP_CLIENT is None or _HTTP_CLIENT.is_closed:
            # Explicitly use a clean httpx client to avoid environmental pollution
            # or proxy args issues occurring in implicit default client creation.
            _HTTP_CLIENT = httpx.Client(timeout=httpx.Timeout(600.0))
        return _HTTP_CLIENT


class LLMGateway:
    """
    Low-level Driver for OpenAI-compatible LLM Providers.
    Handles authentication, client creation, and raw API calls.
    Enforces JSON generation and generic error handling.
    """

    @staticmethod
    def _get_openai_client(api_key, base_url):
        return openai.OpenAI(api_key=api_key, base_url=base_url, http_client=_get_shared_http_client())

    def _retry_wrapper(self, func_name, func, *args, **kwargs):
        """
        Internal Retryer for Network Resilience.
        Retries: 2 times (Total 3 attempts).
        Delay: 1.5s, 3s.
        Catch: SSL, Connection, Timeout errors.
        """
        import time
        import ssl

        max_retries = 2
        for attempt in range(max_retries + 1):
            try:
                return func(*args, **kwargs)
            except (ssl.SSLEOFError, ssl.SSLError, httpx.ReadError, httpx.ConnectError, httpx.TimeoutException) as e:
                if attempt < max_retries:
                    wait_time = (attempt + 1) * 1.5
                    print(f"⚠️ [LLM Gateway] Network Error ({type(e).__name__}) during {func_name}. Retrying ({attempt+1}/{max_retries}) in {wait_time}s...")
                    time.sleep(wait_time)
                    continue

                # If exhausted, re-raise
                print(f"❌ [LLM Gateway] Failed after {attempt} retries: {str(e)}")
                raise e

    def call_openai(self, api_key, base_url, model_name, messages, temperature=0.7, response_schema=None, extra_body=None):
        """
        Execute OpenAI/Compatible request.

        Args:
            response_schema: Optional JSON schema dict for structured output.
                            Requires provider support for json_schema response format;
                            callers decide (per-model config) whether to pass it.
            extra_body: Optional dict of provider-specific body params (e.g.
                        {"enable_thinking": False} for DashScope/Qwen).
        """
        client = self._get_openai_client(api_key, base_url)

        # Build response_format based on schema presence
        if response_schema:
            # OpenAI Structured Outputs (json_schema format)
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
