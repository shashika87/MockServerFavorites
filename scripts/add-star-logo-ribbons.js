const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const WATCHLIST_URL = "https://mockserverfavorites.onrender.com/watchlists/v5/watches.json";

const LEAGUE_FILES = [
    "favorite_teams_nfl.json",
    "favorite_teams_nba.json",
    "favorite_teams_nhl.json",
    "favorite_teams_mlb.json",
    "favorite_teams_mls.json",
    "favorite_teams_ncaaf.json",
    "favorite_teams_eps.json",
];

const RIBBON_ANALYTICS = {
    AccountGuid: "804fc3b0-6b5f-11f1-9f90-7a7bc35467e0",
    AccountStatus: "Paid",
    DeviceGuid: "069e8d22-3f57-58e1-b072-c0680d357e5a",
    ProfileGuid: "804fc3b0-6b5f-11f1-9f90-7a7bc35467e0",
    ProfileType: "Admin",
    query_id: "/drawer/favorites",
    ScreenName: "fluid-guide",
    SessionID: "",
    TabName: "Guide",
};

function seededRandom(seed) {
    let state = seed;

    return () => {
        state = (state * 1664525 + 1013904223) % 4294967296;
        return state / 4294967296;
    };
}

function hashString(value) {
    let hash = 0;

    for (let i = 0; i < value.length; i += 1) {
        hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
    }

    return hash || 1;
}

function getChannelId(tile) {
    return (
        tile.analytics?.item_id ||
        tile.actions?.FAVORITE_WITH_INVALIDATION?.payload?.channel_guid ||
        tile.actions?.UNFAVORITE_WITH_INVALIDATION?.payload?.channel_guid
    );
}

function collectTeamTiles(data) {
    const tiles = [];

    for (const ribbon of data.ribbons || []) {
        if (ribbon.alpha === "fav" || ribbon.icon?.key === "FAVORITE_HEART_FILLED" || ribbon.icon?.key === "STAR_LOGO") {
            continue;
        }

        for (const tile of ribbon.tiles || []) {
            if (tile.format === "CHANNEL_CARD" && getChannelId(tile)) {
                tiles.push(tile);
            }
        }
    }

    return tiles;
}

function cloneTile(tile) {
    const cloned = JSON.parse(JSON.stringify(tile));
    const channelId = getChannelId(cloned);
    const image =
        cloned.image ||
        cloned.actions?.FAVORITE_WITH_INVALIDATION?.toast_info?.image ||
        cloned.actions?.UNFAVORITE_WITH_INVALIDATION?.toast_info?.image;

    if (image) {
        cloned.image = {
            h: image.h,
            url: image.url,
            w: image.w,
        };
    }

    if (cloned.actions?.FAVORITE_WITH_INVALIDATION) {
        cloned.actions.FAVORITE_WITH_INVALIDATION.url = WATCHLIST_URL;
    }

    if (cloned.actions?.UNFAVORITE_WITH_INVALIDATION) {
        cloned.actions.UNFAVORITE_WITH_INVALIDATION.url = WATCHLIST_URL;
    }

    if (channelId) {
        cloned.analytics = {
            item_id: channelId,
            query_id: "/drawer/favorites",
        };

        cloned.primary_action = {
            condition: {
                decision: "IS_FAVORITED",
                checks: {
                    favorite_channel: channelId,
                },
                true: "UNFAVORITE_WITH_INVALIDATION",
                false: "FAVORITE_WITH_INVALIDATION",
            },
        };

        cloned.overlay_indicators = [
            {
                icon: {
                    key: {
                        condition: {
                            decision: "IS_FAVORITED",
                            checks: {
                                favorite_channel: channelId,
                            },
                            true: "FAVORITE_HEART_FILLED",
                            false: "FAVORITE_HEART_EMPTY",
                        },
                    },
                    type: "STATIC",
                },
            },
        ];
    }

    return cloned;
}

function pickTeams(teamTiles, count, rng) {
    const pool = [...teamTiles];

    for (let i = pool.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    return pool.slice(0, count).map(cloneTile);
}

function buildStarLogoRibbon(tiles) {
    return {
        icon: {
            key: "STAR_LOGO",
            type: "STATIC",
        },
        format: "GRID",
        ribbon_analytics: { ...RIBBON_ANALYTICS },
        sub_title: String(tiles.length),
        tiles,
        title: "Recommended Teams",
        total_tiles: tiles.length,
    };
}

function removeStarLogoRibbons(data) {
    data.ribbons = (data.ribbons || []).filter((ribbon) => ribbon.icon?.key !== "STAR_LOGO");
}

for (const file of LEAGUE_FILES) {
    const filePath = path.join(DATA_DIR, file);
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const teamTiles = collectTeamTiles(data);

    if (teamTiles.length === 0) {
        console.log(`${file}: skipped, no team tiles found`);
        continue;
    }

    const rng = seededRandom(hashString(file));
    const tileCount = 1 + Math.floor(rng() * 5);
    const selectedCount = Math.min(tileCount, teamTiles.length);
    const selectedTiles = pickTeams(teamTiles, selectedCount, rng);

    removeStarLogoRibbons(data);
    data.ribbons.unshift(buildStarLogoRibbon(selectedTiles));

    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");

    const teamNames = selectedTiles.map((tile) => tile.team_name || tile.team_abbr || getChannelId(tile)).join(", ");
    console.log(`${file}: added STAR_LOGO ribbon with ${selectedCount} tile(s) -> ${teamNames}`);
}
