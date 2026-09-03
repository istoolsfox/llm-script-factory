"use client";

import { WorldBible } from "@/components/world-bible";
import { BiblePageShell } from "@/components/bible-page-shell";

export default function RelationshipsPage() {
    return (
        <BiblePageShell title="Relationships 人物关系" description="人物之间的关系网络：阵营、羁绊与冲突。">
            <WorldBible synopsis={null} concept="" only={["relationships"]} />
        </BiblePageShell>
    );
}
