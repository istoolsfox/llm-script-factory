"use client";

import { useProject } from "@/lib/contexts/project-context";
import { WorldBible } from "@/components/world-bible";
import { BiblePageShell } from "@/components/bible-page-shell";

export default function CharactersPage() {
    return (
        <BiblePageShell title="Characters 人物" description="人物设定：身份、性格、目标与人物弧光。">
            <BibleBody />
        </BiblePageShell>
    );
}

function BibleBody() {
    const { activeProject } = useProject();
    if (!activeProject) return null;
    return <WorldBible synopsis={null} concept="" only={["characters"]} />;
}
