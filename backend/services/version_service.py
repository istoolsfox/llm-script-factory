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
import re
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

# version_id: timestamp + optional seq, e.g. "20260902-153000" / "20260902-153000-003".
VERSION_ID_RE = re.compile(r"^\d{8}-\d{6}(-\d{3})?$")

# Keep at most this many auto_save snapshots per project (manual snapshots are
# never pruned) so iterative saves don't grow the versions folder without bound.
MAX_AUTO_SNAPSHOTS = 30


class VersionService:
    def __init__(self):
        self.projects = ProjectService()

    # =========================================================================
    # PATH HELPERS
    # =========================================================================
    @staticmethod
    def _versions_root(project_dir: str) -> str:
        return os.path.join(project_dir, "versions")

    @staticmethod
    def _validate_version_id(version_id: str) -> None:
        """Reject version ids that could traverse outside the versions folder."""
        if not version_id or not VERSION_ID_RE.match(version_id):
            raise ValueError("Invalid version id")

    @staticmethod
    def _resolve_inside(version_dir: str, relative: str) -> str:
        """Join and verify the result stays inside version_dir."""
        target = os.path.realpath(os.path.join(version_dir, relative))
        root = os.path.realpath(version_dir)
        if not target.startswith(root + os.sep):
            raise ValueError("Invalid component path")
        return target

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

        if tag == "auto_save":
            self._prune_auto_snapshots(versions_root)

        return meta

    def _prune_auto_snapshots(self, versions_root: str, keep: int = MAX_AUTO_SNAPSHOTS):
        """Delete the oldest auto_save snapshots beyond the retention limit."""
        autos = []
        for vid in os.listdir(versions_root):
            meta_path = os.path.join(versions_root, vid, "meta.json")
            if not os.path.isfile(meta_path):
                continue
            try:
                with open(meta_path, "r", encoding="utf-8") as fh:
                    meta = json.load(fh)
                if meta.get("tag") == "auto_save":
                    autos.append(vid)
            except Exception:
                continue

        autos.sort(reverse=True)  # newest first (ids sort chronologically)
        for vid in autos[keep:]:
            shutil.rmtree(os.path.join(versions_root, vid), ignore_errors=True)

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
        self._validate_version_id(version_id)
        project_dir = self.projects.get_project_path(project_name)
        if not project_dir:
            raise ValueError("Project not found")
        version_dir = os.path.join(self._versions_root(project_dir), version_id)
        if not os.path.isdir(version_dir):
            raise ValueError("Version not found")
        target = self._resolve_inside(version_dir, component)
        if not os.path.isfile(target):
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
        Data directories present now but absent from the snapshot are removed,
        so restore reproduces the snapshot state exactly.
        """
        self._validate_version_id(version_id)
        project_dir = self.projects.get_project_path(project_name)
        if not project_dir:
            raise ValueError("Project not found")
        version_dir = os.path.join(self._versions_root(project_dir), version_id)
        if not os.path.isdir(version_dir):
            raise ValueError("Version not found")

        # 1. snapshot current state to allow undo
        self.snapshot(project_name, tag="before_restore")

        # 2. remove current data dirs that the snapshot will replace, so stale
        #    content from a later state doesn't survive the restore
        snapshot_items = set(os.listdir(version_dir)) - {"meta.json"}
        for d in DATA_DIRS:
            dst = os.path.join(project_dir, d)
            if d not in snapshot_items and os.path.isdir(dst):
                shutil.rmtree(dst)

        # 3. copy version data back over project dir
        for item in snapshot_items:
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
        self._validate_version_id(version_id)
        project_dir = self.projects.get_project_path(project_name)
        if not project_dir:
            raise ValueError("Project not found")
        version_dir = os.path.join(self._versions_root(project_dir), version_id)
        if not os.path.isdir(version_dir):
            raise ValueError("Version not found")
        shutil.rmtree(version_dir)
        return True
