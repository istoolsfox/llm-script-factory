"""
Archive Service: Project Archiving
Moves projects to backup/ directory with version numbering.
"""
import os
import re
import shutil
from typing import Optional


class ArchiveService:
    """
    Service for archiving projects to backup directory.
    Supports versioning: project, project-V2, project-V3, etc.
    """
    
    def __init__(self):
        # backend/ directory (parent of services/)
        self.backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.projects_dir = os.path.join(self.backend_dir, "projects")
        self.backup_dir = os.path.join(self.backend_dir, "backup")
    
    def archive_project(self, project_name: str) -> str:
        """
        Archive a project to backup/ directory.

        Args:
            project_name: Name of the project to archive

        Returns:
            Path to the archived project

        Raises:
            ValueError: If project doesn't exist or name is invalid
        """
        # 1. Validate source project exists (also guards against traversal)
        source_path = os.path.join(self.projects_dir, project_name)
        if ".." in project_name or "/" in project_name or "\\" in project_name or \
                os.path.realpath(source_path) != os.path.realpath(self.projects_dir + os.sep + project_name) or \
                not os.path.isdir(source_path):
            raise ValueError(f"项目 '{project_name}' 不存在")
        
        # 2. Ensure backup directory exists
        os.makedirs(self.backup_dir, exist_ok=True)
        
        # 3. Calculate target name with version
        target_name = self._get_next_version_name(project_name)
        target_path = os.path.join(self.backup_dir, target_name)
        
        # 4. Move project folder
        shutil.move(source_path, target_path)
        
        print(f"✅ Project '{project_name}' archived to: {target_path}")
        return target_path
    
    def _get_next_version_name(self, project_name: str) -> str:
        """
        Calculate the next available version name for archiving.
        
        Logic:
        - If no existing archive: return project_name (no suffix)
        - If project_name exists: return project_name-V2
        - If project_name-V2 exists: return project_name-V3
        - ...and so on
        """
        if not os.path.exists(self.backup_dir):
            return project_name
        
        # List all directories in backup/
        existing_dirs = set(os.listdir(self.backup_dir))
        
        # If base name doesn't exist, use it
        if project_name not in existing_dirs:
            return project_name
        
        # Find all versioned copies: project_name-V2, project_name-V3, etc.
        pattern = re.compile(rf"^{re.escape(project_name)}-V(\d+)$")
        max_version = 1  # Base version counts as V1
        
        for dir_name in existing_dirs:
            match = pattern.match(dir_name)
            if match:
                version = int(match.group(1))
                max_version = max(max_version, version)
        
        # Return next version
        next_version = max_version + 1
        return f"{project_name}-V{next_version}"
    
    def list_archived_projects(self) -> list:
        """
        List all archived projects in backup/ directory.
        
        Returns:
            List of archived project names
        """
        if not os.path.exists(self.backup_dir):
            return []
        
        return [
            name for name in os.listdir(self.backup_dir)
            if os.path.isdir(os.path.join(self.backup_dir, name))
        ]
