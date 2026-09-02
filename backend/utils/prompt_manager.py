import os
from jinja2 import Environment, FileSystemLoader

# Backend root directory (parent of utils/). Templates are resolved against it
# so template loading works regardless of the process working directory.
_BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

class PromptManager:
    """
    Manages loading and rendering of prompt templates.
    Uses Jinja2 for dynamic content injection.
    """

    def __init__(self, template_dir=None):
        self.template_dir = template_dir or os.path.join(_BACKEND_ROOT, "prompts")
        # Config Jinja environment
        self.env = Environment(loader=FileSystemLoader(searchpath=self.template_dir))

    def load_template_content(self, relative_path):
        """
        Load raw string content of a template.
        Useful for inspecting or raw injection.
        """
        try:
            path = os.path.join(self.template_dir, relative_path)
            with open(path, "r", encoding="utf-8") as f:
                return f.read()
        except FileNotFoundError:
            return ""

    def render(self, template_name, **kwargs):
        """
        Render a specific template file with arguments.

        Args:
            template_name (str): Path relative to 'prompts/', e.g., 'stage2/1_dtg_theory.j2'
            **kwargs: Variables to inject into the template.

        Returns:
            str: Rendered string.
        """
        try:
            template = self.env.get_template(template_name)
            return template.render(**kwargs)
        except Exception as e:
            # Fallback or Error
            raise ValueError(f"Template Render Failed ({template_name}): {str(e)}")

    @staticmethod
    def load_dtg_theory(branch, file_list):
        """
        Special helper to load Distributed Theory Generation (DTG) documents.
        This often involves concatenating multiple files.

        Args:
            branch (str): Subfolder in prompts/ (e.g. 'dtg/Distill-1')
            file_list (List[str]): List of filenames to load.
        """
        base_path = os.path.join(_BACKEND_ROOT, "prompts", branch)
        content = ""
        for f in file_list:
            p = os.path.join(base_path, f)
            if os.path.exists(p):
                with open(p, "r", encoding="utf-8") as fh:
                    content += f"\n\n--- {f} ---\n{fh.read()}\n"
        return content
