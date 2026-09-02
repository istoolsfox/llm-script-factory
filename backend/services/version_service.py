"""
Version Service: snapshot, list, view, and restore project versions.
Each snapshot captures the project's data dir (1_ideas ~ 6_scripts + bible +
settings/user_input) so the user can go back to any past state.

Storage layout:
    projects/<name>/versions/<version_id>/
        meta.json     -> { id, timestamp, tag, files }
        <copied data files>
"""
import os
import json
import shutil
import datetime
from typing import Dict, List, Optional
from services.project_service import ProjectService


# Sub-directories (and files) that constitute the project's mutable data.
DATA_DIRS = [
    "1_ideas", "2_structure", "3_scripts", "4_scripts", "5_scripts", "6_scripts",
    "bible",
]
DATA_FILES = ["settings.json"]


class VersionService:
    def __init__(self):
        self.projects = ProjectService()

    # =========================================================================
    # PATH HELPERS
    # =========================================================================
    @staticmethod
    def _versions_root(project_dir: str) -> str:
        return os.path.join(project_dir, "versions")

    # =========================================================================
    # SNAPSHOT
    # =========================================================================
    def snapshot(self, project_name: str, tag: str = "auto", files: Optional[List[str]] = None) -> Optional[Dict]:
        """
        Create a new snapshot of the project's current data state.
        Returns meta dict on success, None if project missing.
        """
        project_dir = self.projects.get_project_path(project_name)
        if not project_dir:
            return None

        versions_root = self._versions_root(project_dir)
        os.makedirs(versions_root, exist_ok=True)

        # Generate a unique version id: timestamp + seq
        ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
        base = ts
        seq = 0
        version_id = base
        while os.path.exists(os.path.join(versions_root, version_id)):
            seq += 1
            version_id = f"{base}-{seq:03d}"

        version_dir = os.path.join(versions_root, version_id)
        os.makedirs(version_dir)

        captured = []
        # Copy data directories
        for d in DATA_DIRS:
            src = os.path.join(project_dir, d)
            if os.path.isdir(src):
                dst = os.path.join(version_dir, d)
                shutil.copytree(src, dst)
                captured.append(d)
        # Copy data files (settings, user_input)
        for f in DATA_FILES:
            src = os.path.join(project_dir, f)
            if os.path.isfile(src):
                shutil.copy2(src, os.path.join(version_dir, f))
                captured.append(f)
        # user_input.json lives inside 1_ideas, already covered by copytree.

        meta = {
            "id": version_id,
            "timestamp": datetime.datetime.now().isoformat(),
            "tag": tag,
            "files": captured,
        }
        with open(os.path.join(version_dir, "meta.json"), "w", encoding="utf-8") as fh:
            json.dump(meta, fh, ensure_ascii=False, indent=2)

        return meta

    # =========================================================================
    # LIST
    # =========================================================================
    def list_versions(self, project_name: str) -> List[Dict]:
        project_dir = self.projects.get_project_path(project_name)
        if not project_dir:
            return []
        versions_root = self._versions_root(project_dir)
        if not os.path.isdir(versions_root):
            return []
        result = []
        for vid in sorted(os.listdir(versions_root), reverse=True):
            meta_path = os.path.join(versions_root, vid, "meta.json")
            if os.path.isfile(meta_path):
                try:
                    with open(meta_path, "r", encoding="utf-8") as fh:
                        result.append(json.load(fh))
                except Exception:
                    result.append({"id": vid, "timestamp": "", "tag": "", "files": []})
        return result

    # =========================================================================
    # VIEW (get snapshot content for a component)
    # =========================================================================
    def get_version_data(self, project_name: str, version_id: str, component: str) -> Dict:
        """
        Return the snapshot content of a specific path/component for a version.
        component e.g. '1_ideas/story_bible.json', 'bible.json', 'settings.json'.
        """
        project_dir = self.projects.get_project_path(project_name)
        if not project_dir:
            raise ValueError("Project not found")
        version_dir = os.path.join(self._versions_root(project_dir), version_id)
        target = os.path.join(version_dir, component)
        if not os.path.exists(target):
            return {}
        try:
            with open(target, "r", encoding="utf-8") as fh:
                return json.load(fh)
        except Exception:
            return {}

    # =========================================================================
    # RESTORE
    # =========================================================================
    def restore_version(self, project_name: str, version_id: str) -> bool:
        """
        Restore the project data to a snapshot. The current state is first
        snapshotted (so undo is possible), then the version data is copied over.
        """
        project_dir = self.projects.get_project_path(project_name)
        if not project_dir:
            raise ValueError("Project not found")
        version_dir = os.path.join(self._versions_root(project_dir), version_id)
        if not os.path.isdir(version_dir):
            raise ValueError("Version not found")

        # 1. snapshot current state to allow undo
        current = self.snapshot(project_name, tag="before_restore")

        # 2. copy version data back over project dir
        for item in os.listdir(version_dir):
            if item == "meta.json":
                continue
            src = os.path.join(version_dir, item)
            dst = os.path.join(project_dir, item)
            if os.path.isdir(src):
                if os.path.exists(dst):
                    shutil.rmtree(dst)
                shutil.copytree(src, dst)
            elif os.path.isfile(src):
                shutil.copy2(src, dst)

        return True

    # =========================================================================
    # CLEANUP
    # =========================================================================
    def delete_version(self, project_name: str, version_id: str) -> bool:
        project_dir = self.projects.get_project_path(project_name)
        if not project_dir:
            raise ValueError("Project not found")
        version_dir = os.path.join(self._versions_root(project_dir), version_id)
        if not os.path.isdir(version_dir):
            raise ValueError("Version not found")
        shutil.rmtree(version_dir)
        return True
