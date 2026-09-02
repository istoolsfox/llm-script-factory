# import streamlit as st # Removed to avoid dependency in pure backend
import datetime
import json
import os
from pathlib import Path

# Mock session state if needed or specific memory storage
_MEMORY_LOGS = []

# Delete debug logs older than this many days.
LOG_RETENTION_DAYS = 30
_LAST_PRUNE_DAY = None

class DebugManager:
    """
    Central Logging & Debugging Utility.
    Stores logs in memory (session) for UI widget and persists to disk (logs/) for Page 99.
    """

    LOG_DIR = str(Path(__file__).resolve().parent.parent / "logs")

    @staticmethod
    def _prune_old_logs():
        """Delete daily log files beyond the retention window (runs once per day)."""
        global _LAST_PRUNE_DAY
        today = datetime.date.today()
        if _LAST_PRUNE_DAY == today or not os.path.isdir(DebugManager.LOG_DIR):
            return
        cutoff = today - datetime.timedelta(days=LOG_RETENTION_DAYS)
        try:
            for f in os.listdir(DebugManager.LOG_DIR):
                if not (f.startswith("debug_log_") and f.endswith(".jsonl")):
                    continue
                date_str = f.replace("debug_log_", "").replace(".jsonl", "")
                try:
                    if datetime.datetime.strptime(date_str, "%Y-%m-%d").date() < cutoff:
                        os.remove(os.path.join(DebugManager.LOG_DIR, f))
                except ValueError:
                    continue
            _LAST_PRUNE_DAY = today
        except Exception as e:
            print(f"Log pruning failed: {e}")

    @staticmethod
    def _get_log_filepath(date_str=None):
        if not os.path.exists(DebugManager.LOG_DIR):
            os.makedirs(DebugManager.LOG_DIR)

        if not date_str:
            date_str = datetime.datetime.now().strftime("%Y-%m-%d")

        return os.path.join(DebugManager.LOG_DIR, f"debug_log_{date_str}.jsonl")

    @staticmethod
    def log_interaction(model_key, prompt, system, response, token_usage=None, 
                       error=None, cache_hit=False, raw_response=None, source=None):
        """
        Log an LLM interaction.
        
        Args:
            model_key (str): The model identifier.
            prompt (str): The user prompt sent.
            system (str): The system prompt (if any).
            response (dict/str): The parsed JSON response.
            token_usage (dict): {'input': int, 'output': int}.
            error (str): Error message if failed.
            cache_hit (bool): Whether cache was used.
            raw_response (str): The raw text response before parsing.
            source (str): The source of the request (e.g. "stage1/synopsis", "stage2/batch", "stage3/generate").
        """
        # 1. Structure the Log Entry
        entry = {
            "timestamp": datetime.datetime.now().isoformat(),
            "source": source or "unknown",
            "model": model_key,
            "cache_hit": cache_hit,
            "system": system,
            "prompt": prompt,
            "response_parsed": response,
            "response_raw": raw_response, # Added raw content
            "token_usage": token_usage or {"input": 0, "output": 0},
            "error": str(error) if error else None
        }
        
        # 2. Memory Storage (Global List)
        global _MEMORY_LOGS
        _MEMORY_LOGS.insert(0, entry)
        if len(_MEMORY_LOGS) > 50:
            _MEMORY_LOGS = _MEMORY_LOGS[:50]
            
        # 3. Disk Persistence (JSONL)
        try:
            DebugManager._prune_old_logs()
            filepath = DebugManager._get_log_filepath()
            # Append mode
            with open(filepath, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        except Exception as e:
            print(f"Logging persistence failed: {e}")

    @staticmethod
    def get_logs():
        """Get in-memory logs."""
        global _MEMORY_LOGS
        return _MEMORY_LOGS

    @staticmethod
    def get_daily_logs(date_str=None):
        """
        Read logs from disk for a specific date (YYYY-MM-DD).
        """
        filepath = DebugManager._get_log_filepath(date_str)
        logs = []
        
        if os.path.exists(filepath):
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    for line in f:
                        if line.strip():
                            try:
                                logs.append(json.loads(line))
                            except Exception:
                                pass
            except Exception as e:
                return []
        
        # Return reversed (newest first) for UI display
        return list(reversed(logs))

    @staticmethod
    def get_available_dates() -> list:
        """获取可用的日志日期列表（最新在前）"""
        log_dir = DebugManager.LOG_DIR
        dates = []
        
        if os.path.exists(log_dir):
            files = [f for f in os.listdir(log_dir) if f.startswith("debug_log_") and f.endswith(".jsonl")]
            dates = [f.replace("debug_log_", "").replace(".jsonl", "") for f in files]
            dates.sort(reverse=True)
        
        return dates

    @staticmethod
    def get_logs_with_stats(date_str: str, errors_only: bool = False) -> dict:
        """获取指定日期的日志及统计信息"""
        logs = DebugManager.get_daily_logs(date_str)
        
        # Filter errors if requested
        if errors_only:
            logs = [log for log in logs if log.get("error")]
        
        # Calculate stats (on original logs, not filtered)
        all_logs = DebugManager.get_daily_logs(date_str)
        stats = {
            "total_calls": len(all_logs),
            "error_count": len([log for log in all_logs if log.get("error")]),
            "total_input_tokens": sum(log.get("token_usage", {}).get("input", 0) for log in all_logs),
            "total_output_tokens": sum(log.get("token_usage", {}).get("output", 0) for log in all_logs)
        }
        
        return {
            "date": date_str,
            "logs": logs,
            "stats": stats
        }

