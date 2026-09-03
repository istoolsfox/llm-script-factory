"use client";

import { WorldBible } from "@/components/world-bible";
import { BiblePageShell } from "@/components/bible-page-shell";

export default function WorldPage() {
    return (
        <BiblePageShell title="World 世界" description="世界观、时代背景、势力格局与主线脉络。">
            <WorldBible synopsis={null} concept="" only={["worldview", "main_plot"]} />
        </BiblePageShell>
    );
}
