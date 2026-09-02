from typing import List, Dict
from utils.llm_manager import LLMManager

class ModelService:
    """
    Service for managing AI Model configurations and availability.
    """
    
    def __init__(self):
        self.llm_manager = LLMManager()

    def get_available_models(self) -> List[Dict]:
        """
        Retrieve available models from configuration and format for frontend.

        Returns:
            List of model definitions with id, name, provider.
        """
        models_cfg = self.llm_manager.config.get("models", {})
        result = []

        # Sort or process if needed?
        # For now, just iteration order of yaml (usually preserved in python 3.7+)

        for key, data in models_cfg.items():
            result.append({
                "id": key,
                "name": data.get("description", key),
                "provider": data.get("provider"),
            })

        return result
