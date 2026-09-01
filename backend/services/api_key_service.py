"""
API Key Service
管理 .env 文件中的 API Keys
职责：读写 .env，不涉及 provider 逻辑（provider 在 Model 管理中处理）
"""
import os
import re
from pathlib import Path
from typing import Optional


class ApiKeyService:
    """API Key 管理服务，操作 .env 文件"""
    
    ENV_PATH = Path(__file__).parent.parent / ".env"
    ENV_EXAMPLE_PATH = Path(__file__).parent.parent / ".env.example"
    
    @staticmethod
    def _read_env() -> dict[str, str]:
        """读取 .env 文件为字典"""
        env_vars = {}
        if not ApiKeyService.ENV_PATH.exists():
            return env_vars
        
        with open(ApiKeyService.ENV_PATH, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, _, value = line.partition("=")
                    key = key.strip()
                    value = value.strip().strip('"').strip("'")
                    env_vars[key] = value
        return env_vars
    
    @staticmethod
    def _write_env(env_vars: dict[str, str]) -> bool:
        """将字典写入 .env 文件"""
        try:
            lines = []
            for key, value in env_vars.items():
                # 如果值包含特殊字符，用双引号包裹
                if " " in value or '"' in value or "'" in value:
                    value = f'"{value}"'
                lines.append(f"{key}={value}")
            
            with open(ApiKeyService.ENV_PATH, "w", encoding="utf-8") as f:
                f.write("\n".join(lines) + "\n")
            
            # 同步更新环境变量
            for key, value in env_vars.items():
                os.environ[key] = value
            
            return True
        except Exception as e:
            print(f"❌ Write .env failed: {e}")
            return False
    
    @staticmethod
    def list_keys() -> list[dict]:
        """
        返回所有已知 Key 变量的配置状态
        从 models.yaml 中提取所有 api_key_env，检查 .env 中是否已配置
        """
        from utils.llm_manager import LLMManager
        
        # 获取 models.yaml 中定义的所有 api_key_env
        llm = LLMManager()
        key_names = set()
        for model_cfg in llm.config.get("models", {}).values():
            env_name = model_cfg.get("api_key_env")
            if env_name:
                key_names.add(env_name)
        
        # 读取 .env
        env_vars = ApiKeyService._read_env()
        
        # 构建响应
        result = []
        for key_name in sorted(key_names):
            value = env_vars.get(key_name, "")
            is_configured = bool(value and value != "EMPTY")
            result.append({
                "key_name": key_name,
                "is_configured": is_configured,
                # 不返回实际值，只返回掩码提示
                "masked_value": f"{value[:4]}...{value[-4:]}" if len(value) > 10 else ("***" if value else "")
            })
        
        return result
    
    @staticmethod
    def set_key(key_name: str, key_value: str) -> dict:
        """设置/更新某个 Key"""
        if not key_name or not key_value:
            return {"success": False, "error": "Key 名称和值不能为空"}
        
        # 验证 key_name 格式
        if not re.match(r'^[A-Z][A-Z0-9_]*$', key_name):
            return {"success": False, "error": "Key 名称格式不正确（应为大写字母和下划线）"}
        
        env_vars = ApiKeyService._read_env()
        env_vars[key_name] = key_value
        
        if ApiKeyService._write_env(env_vars):
            return {"success": True, "message": f"{key_name} 已保存"}
        return {"success": False, "error": "写入失败"}
    
    @staticmethod
    def delete_key(key_name: str) -> dict:
        """删除某个 Key"""
        env_vars = ApiKeyService._read_env()
        
        if key_name not in env_vars:
            return {"success": False, "error": f"{key_name} 不存在"}
        
        del env_vars[key_name]
        
        # 同时从环境变量中移除
        if key_name in os.environ:
            del os.environ[key_name]
        
        if ApiKeyService._write_env(env_vars):
            return {"success": True, "message": f"{key_name} 已删除"}
        return {"success": False, "error": "写入失败"}
    
    @staticmethod
    def reset_to_default() -> dict:
        """恢复默认（从 .env.example 复制）"""
        try:
            if ApiKeyService.ENV_EXAMPLE_PATH.exists():
                import shutil
                shutil.copy(ApiKeyService.ENV_EXAMPLE_PATH, ApiKeyService.ENV_PATH)
                return {"success": True, "message": "已恢复默认配置"}
            else:
                # 如果没有 example，创建空模板
                default_keys = ["DASHSCOPE_API_KEY"]
                env_vars = {k: "EMPTY" for k in default_keys}
                ApiKeyService._write_env(env_vars)
                return {"success": True, "message": "已恢复默认配置"}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    @staticmethod
    def validate_key(key_name: str, key_value: str) -> dict:
        """
        验证 Key 是否有效
        根据 key_name 推断 provider 并调用对应 API 测试
        """
        try:
            if "DASHSCOPE" in key_name.upper():
                # 阿里云百炼 (OpenAI 兼容) 验证
                import openai
                client = openai.OpenAI(api_key=key_value, base_url="https://dashscope.aliyuncs.com/compatible-mode/v1")
                # 简单测试：列出模型
                client.models.list()
                return {"valid": True, "message": "DashScope API Key 验证通过"}
            
            else:
                return {"valid": False, "message": "无法识别的 Key 类型，跳过验证"}
        
        except Exception as e:
            return {"valid": False, "message": f"验证失败: {str(e)}"}
