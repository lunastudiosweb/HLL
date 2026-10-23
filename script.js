/* =========================================================
   HLL — CUSTOM POINTS FIX
   Reads editable points directly from Supabase.
   Paste this entire block at the VERY BOTTOM of script.js.
   ========================================================= */

/*
   Points rules:

   1. Supabase levels.points is the source of truth.
   2. Custom points such as 250 are displayed as 250.
   3. Custom points are used in the player leaderboard.
   4. Existing levels without configured points use the
      original rank-based formula as a fallback.
*/

function calculateLevelPoints(rank, listType, customPoints) {
    // Use the value configured in Supabase when available.
    // Zero is a valid custom value.
    if (
        customPoints !== null &&
        customPoints !== undefined &&
        customPoints !== ""
    ) {
        const configuredPoints = Number(customPoints);

        if (
            Number.isFinite(configuredPoints) &&
            configuredPoints >= 0
        ) {
            return configuredPoints;
        }
    }

    // Fallback for levels without a configured points value.
    const position = Number(rank);

    if (!Number.isInteger(position)) {
        return 0;
    }

    if (listType === "main") {
        return position >= 1 && position <= 150
            ? 151 - position
            : 0;
    }

    if (listType === "extended") {
        return position >= 151 && position <= 350
            ? Math.floor(((350 - position) * 49) / 199) + 1
            : 0;
    }

    return 0;
}


/* =========================================================
   LOAD APPROVED LEVELS INCLUDING CUSTOM POINTS
   ========================================================= */

async function getApprovedLevels(listType = null) {
    let query = supabaseClient
        .from("levels")
        .select(
            "id, name, level_id, creator, list_type, rank, description, points"
        )
        .eq("status", "approved")
        .order("rank", {
            ascending: true
        });

    if (listType) {
        query = query.eq("list_type", listType);
    }

    const { data, error } = await query;

    if (error) {
        console.error("Level loading failed:", error.message);

        showEmptyState(
            $("ranking-list"),
            "Could not load levels",
            "Check your Supabase levels table, points column, and read policies."
        );

        return null;
    }

    return data || [];
}


/* =========================================================
   MAIN LIST + EXTENDED LIST
   Displays the actual Supabase points value.
   ========================================================= */

async function renderLevelList(listType) {
    const list = $("ranking-list");
    const count = $("list-count");
    const search = $("level-search");

    if (!list) return;

    const isMain = listType === "main";
    const minRank = isMain ? 1 : 151;
    const maxRank = isMain ? 150 : 350;
    const listName = isMain ? "Main List" : "Extended List";

    showEmptyState(
        list,
        "Loading rankings...",
        "Loading levels and their configured points."
    );

    if (count) {
        count.textContent = "Loading rankings...";
    }

    const allLevels = await getApprovedLevels(listType);

    if (allLevels === null) {
        if (count) {
            count.textContent = "Could not load rankings.";
        }

        return;
    }

    const levels = allLevels
        .filter(level => {
            const rank = Number(level.rank);

            return Number.isInteger(rank) &&
                rank >= minRank &&
                rank <= maxRank;
        })
        .sort((a, b) => Number(a.rank) - Number(b.rank));

    function render(items) {
        if (count) {
            count.textContent =
                `${items.length} levels · Ranks #${minRank}–#${maxRank}`;
        }

        if (!items.length) {
            showEmptyState(
                list,
                "No ranked levels yet",
                `No approved levels are currently available in the ${listName}.`
            );

            return;
        }

        list.innerHTML = items.map(level => {
            const rank = Number(level.rank);

            const points = calculateLevelPoints(
                level.rank,
                level.list_type,
                level.points
            );

            let rankClass = "";

            if (rank === 1) {
                rankClass = "rank-first";
            } else if (rank === 2) {
                rankClass = "rank-second";
            } else if (rank === 3) {
                rankClass = "rank-third";
            }

            return `
                <a
                    class="ranking-item hll-level-card"
                    href="level.html?id=${encodeURIComponent(level.id)}"
                >
                    <span class="ranking-position ${rankClass}">
                        #${escapeHTML(rank)}
                    </span>

                    <span class="ranking-details">
                        <strong>
                            ${escapeHTML(level.name || "Unnamed level")}
                        </strong>

                        <span class="hll-level-meta">
                            ${escapeHTML(level.creator || "Unknown creator")}
                            ${
                                level.level_id
                                    ? ` · GD ID: ${escapeHTML(level.level_id)}`
                                    : ""
                            }
                        </span>
                    </span>

                    <span class="hll-points-badge">
                        <strong>${points.toLocaleString()}</strong>
                        <small>POINTS</small>
                    </span>

                    <span class="ranking-arrow" aria-hidden="true">›</span>
                </a>
            `;
        }).join("");
    }

    render(levels);

    if (search && search.dataset.hllCustomPointsSearch !== "true") {
        search.dataset.hllCustomPointsSearch = "true";

        search.addEventListener("input", () => {
            const term = search.value.trim().toLowerCase();

            const filtered = levels.filter(level =>
                String(level.name || "").toLowerCase().includes(term) ||
                String(level.creator || "").toLowerCase().includes(term) ||
                String(level.rank ?? "").includes(term) ||
                String(level.level_id || "").toLowerCase().includes(term)
            );

            render(filtered);
        });
    }
}


/* =========================================================
   PLAYER LEADERBOARD
   Sums custom points from verified completions.
   ========================================================= */

async function renderPlayersList() {
    const list = $("player-list");
    const count = $("player-count");
    const search = $("player-search");

    if (!list) return;

    showEmptyState(
        list,
        "Loading player rankings...",
        "Calculating points from verified completions."
    );

    const [
        profilesResult,
        levelsResult,
        completionsResult
    ] = await Promise.all([
        supabaseClient
            .from("profiles")
            .select("id, username, gd_username")
            .order("username", {
                ascending: true
            }),

        supabaseClient
            .from("levels")
            .select("id, rank, list_type, status, points")
            .eq("status", "approved"),

        supabaseClient
            .from("completions")
            .select("user_id, level_id")
    ]);

    if (profilesResult.error) {
        showEmptyState(
            list,
            "Could not load players",
            profilesResult.error.message
        );

        return;
    }

    if (levelsResult.error) {
        showEmptyState(
            list,
            "Could not load level points",
            levelsResult.error.message
        );

        return;
    }

    if (completionsResult.error) {
        showEmptyState(
            list,
            "Could not load verified completions",
            completionsResult.error.message
        );

        return;
    }

    // Map each approved level to its configured points.
    const levelPoints = new Map();

    for (const level of levelsResult.data || []) {
        const points = calculateLevelPoints(
            level.rank,
            level.list_type,
            level.points
        );

        if (points > 0) {
            levelPoints.set(level.id, points);
        }
    }

    // Initialize every player, including players with zero points.
    const playerTotals = new Map();

    for (const profile of profilesResult.data || []) {
        playerTotals.set(profile.id, {
            ...profile,
            points: 0,
            completions: 0
        });
    }

    // Count each player's completion of a given level only once.
    const countedCompletions = new Set();

    for (const completion of completionsResult.data || []) {
        const player = playerTotals.get(completion.user_id);
        const points = levelPoints.get(completion.level_id);

        if (!player || points === undefined || points <= 0) {
            continue;
        }

        const uniqueKey =
            `${completion.user_id}:${completion.level_id}`;

        if (countedCompletions.has(uniqueKey)) {
            continue;
        }

        countedCompletions.add(uniqueKey);

        player.points += points;
        player.completions += 1;
    }

    const players = [...playerTotals.values()].sort((a, b) =>
        b.points - a.points ||
        b.completions - a.completions ||
        String(a.username || "").localeCompare(
            String(b.username || "")
        )
    );

    function render(items) {
        if (count) {
            count.textContent = `${items.length} players`;
        }

        if (!items.length) {
            showEmptyState(
                list,
                "No players found",
                "Create an account to join the HLL community."
            );

            return;
        }

        list.innerHTML = items.map((player, index) => {
            const position = index + 1;

            let rankClass = "";

            if (position === 1) {
                rankClass = "rank-first";
            } else if (position === 2) {
                rankClass = "rank-second";
            } else if (position === 3) {
                rankClass = "rank-third";
            }

            return `
                <a
                    class="ranking-item hll-player-card"
                    href="profile.html?id=${encodeURIComponent(player.id)}"
                >
                    <span class="ranking-position ${rankClass}">
                        #${position}
                    </span>

                    <span class="ranking-details">
                        <strong>
                            ${escapeHTML(player.username || "Player")}
                        </strong>

                        <span>
                            ${player.completions}
                            verified level${player.completions === 1 ? "" : "s"}
                        </span>
                    </span>

                    <span class="hll-points-badge">
                        <strong>${player.points.toLocaleString()}</strong>
                        <small>POINTS</small>
                    </span>

                    <span class="ranking-arrow" aria-hidden="true">›</span>
                </a>
            `;
        }).join("");
    }

    render(players);

    if (search && search.dataset.hllCustomPointsSearch !== "true") {
        search.dataset.hllCustomPointsSearch = "true";

        search.addEventListener("input", () => {
            const term = search.value.trim().toLowerCase();

            render(players.filter(player =>
                String(player.username || "").toLowerCase().includes(term) ||
                String(player.gd_username || "").toLowerCase().includes(term)
            ));
        });
    }
}


/* =========================================================
   LEVEL DETAILS
   Displays custom points on level.html.
   ========================================================= */

async function renderLevelDetail() {
    const title = $("level-title");

    if (!title) return;

    const id = getQueryParameter("id");

    if (!id) {
        title.textContent = "Level not found";
        return;
    }

    const { data: level, error } = await supabaseClient
        .from("levels")
        .select("*")
        .eq("id", id)
        .eq("status", "approved")
        .maybeSingle();

    if (error || !level) {
        title.textContent = "Level not found";
        return;
    }

    title.textContent = level.name || "Unnamed level";

    if ($("level-list-type")) {
        $("level-list-type").textContent =
            level.list_type === "main"
                ? "Main List"
                : "Extended List";
    }

    if ($("level-description")) {
        $("level-description").textContent =
            level.description || "No description provided.";
    }

    if ($("level-rank")) {
        $("level-rank").textContent = `#${level.rank ?? "—"}`;
    }

    if ($("level-points")) {
        const points = calculateLevelPoints(
            level.rank,
            level.list_type,
            level.points
        );

        $("level-points").textContent =
            `${points.toLocaleString()} points`;
    }

    if ($("level-detail-name")) {
        $("level-detail-name").textContent =
            level.name || "Unnamed level";
    }

    if ($("level-creator")) {
        $("level-creator").textContent =
            level.creator || "Unknown";
    }

    if ($("level-id")) {
        $("level-id").textContent =
            level.level_id || "Not provided";
    }

    if ($("level-status")) {
        $("level-status").textContent = "Approved";
    }

    if ($("level-completion-count")) {
        $("level-completion-count").textContent = "Loading...";
    }

    const list = $("level-completions");

    const { data: completions, error: completionError } =
        await supabaseClient
            .from("completions")
            .select("id, user_id, verified_at")
            .eq("level_id", level.id)
            .order("verified_at", {
                ascending: false
            });

    if (completionError) {
        showEmptyState(
            list,
            "Could not load completions",
            "Please try again later."
        );

        return;
    }

    const verified = completions || [];

    if ($("level-completion-count")) {
        $("level-completion-count").textContent =
            String(verified.length);
    }

    if (!list) return;

    if (!verified.length) {
        showEmptyState(
            list,
            "No verified completions yet",
            "Verified completions will appear here."
        );

        return;
    }

    const userIds = [
        ...new Set(
            verified.map(completion => completion.user_id)
        )
    ];

    const { data: profiles, error: profileError } =
        await supabaseClient
            .from("profiles")
            .select("id, username")
            .in("id", userIds);

    if (profileError) {
        showEmptyState(
            list,
            "Could not load player names",
            "Please try again later."
        );

        return;
    }

    const names = Object.fromEntries(
        (profiles || []).map(profile => [
            profile.id,
            profile.username
        ])
    );

    list.innerHTML = verified.map(completion => `
        <a
            class="ranking-item"
            href="profile.html?id=${encodeURIComponent(completion.user_id)}"
        >
            <span class="ranking-details">
                <strong>
                    ${escapeHTML(names[completion.user_id] || "Player")}
                </strong>

                <span>
                    Verified ${escapeHTML(formatDate(completion.verified_at))}
                </span>
            </span>
        </a>
    `).join("");
}

console.log("HLL custom points system loaded.");
