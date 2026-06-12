const fs = require("fs");
const path = require("path");

const STACK_FILE_ALIASES = {
    epl: "eps",
};

const STACK_PREFIXES = ["nfl", "nba", "ncaaf", "nhl", "mlb", "mls", "epl"];

function getTileChannelId(tile) {
    return (
        tile.analytics?.item_id ||
        tile.actions?.FAVORITE_WITH_INVALIDATION?.payload?.channel_guid ||
        tile.actions?.UNFAVORITE_WITH_INVALIDATION?.payload?.channel_guid
    );
}

function extractStack(channelGuid) {
    const prefix = String(channelGuid || "").split("_")[0].toLowerCase();
    if (!STACK_PREFIXES.includes(prefix)) {
        return null;
    }
    return prefix;
}

function getStackFilePath(dataDir, stack) {
    const fileKey = STACK_FILE_ALIASES[stack] || stack;
    return path.join(dataDir, `favorite_teams_${fileKey}.json`);
}

function getFavoritesFilePath(dataDir) {
    return path.join(dataDir, "favorites.json");
}

function readFavorites(dataDir) {
    const favoritesFile = getFavoritesFilePath(dataDir);
    if (!fs.existsSync(favoritesFile)) {
        return { total: 0, teams: [] };
    }
    return readJsonFile(favoritesFile);
}

function writeFavorites(dataDir, favorites) {
    favorites.total = favorites.teams.length;
    writeJsonFile(getFavoritesFilePath(dataDir), favorites);
}

function buildFavoriteEntry(stack, channelGuid, tile) {
    return {
        channel_guid: channelGuid,
        stack,
        team_abbr: tile.team_abbr,
        team_name: tile.team_name,
        image_url: tile.image?.url || null,
        favorited_at: new Date().toISOString(),
    };
}

function ensureTileImage(tile) {
    const toastImage = tile.actions?.FAVORITE_WITH_INVALIDATION?.toast_info?.image;
    if (!toastImage) {
        return tile;
    }

    tile.image = {
        h: toastImage.h,
        url: toastImage.url,
        w: toastImage.w,
    };

    return tile;
}

function addToFavoritesIndex(dataDir, stack, channelGuid, tile) {
    const favorites = readFavorites(dataDir);
    const exists = favorites.teams.some((team) => team.channel_guid === channelGuid);

    if (!exists) {
        favorites.teams.push(buildFavoriteEntry(stack, channelGuid, tile));
        writeFavorites(dataDir, favorites);
    }

    return favorites.teams.length;
}

function removeFromFavoritesIndex(dataDir, channelGuid) {
    const favorites = readFavorites(dataDir);
    const beforeCount = favorites.teams.length;
    favorites.teams = favorites.teams.filter((team) => team.channel_guid !== channelGuid);

    if (favorites.teams.length !== beforeCount) {
        writeFavorites(dataDir, favorites);
    }

    return favorites.teams.length;
}

function readJsonFile(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function writeJsonFile(filePath, data) {
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

function findTileByChannelId(data, channelId) {
    for (const ribbon of data.ribbons || []) {
        for (const tile of ribbon.tiles || []) {
            if (getTileChannelId(tile) === channelId) {
                return { ribbon, tile };
            }
        }
    }
    return null;
}

function isFavRibbon(ribbon) {
    return ribbon?.alpha === "fav" || ribbon?.icon?.key === "FAVORITE_HEART_FILLED";
}

function normalizeFavRibbon(ribbon) {
    if (ribbon.alpha === "fav") {
        delete ribbon.alpha;
        ribbon.icon = {
            key: "FAVORITE_HEART_FILLED",
            type: "STATIC",
        };

        if (ribbon.title === "fav") {
            delete ribbon.title;
        }
    }

    ribbon.title = "Your favorite teams";

    return ribbon;
}

function findFavRibbon(data) {
    const ribbon = (data.ribbons || []).find(isFavRibbon);
    return ribbon ? normalizeFavRibbon(ribbon) : null;
}

function updateRibbonCounts(ribbon) {
    ribbon.total_tiles = ribbon.tiles.length;
    ribbon.sub_title = String(ribbon.tiles.length);
}

function createFavRibbon(templateRibbon) {
    return {
        icon: {
            key: "FAVORITE_HEART_FILLED",
            type: "STATIC",
        },
        format: "GRID",
        ribbon_analytics: templateRibbon?.ribbon_analytics
            ? { ...templateRibbon.ribbon_analytics }
            : {
                  AccountGuid: "",
                  AccountStatus: "Paid",
                  DeviceGuid: "",
                  ProfileGuid: "",
                  ProfileType: "Non Admin",
                  ScreenName: "Home",
                  SessionID: "",
                  TabName: "Home",
                  query_id: "/drawer/favorites",
              },
        sub_title: "0",
        tiles: [],
        title: "Your favorite teams",
        total_tiles: 0,
    };
}

function favoriteTeam(dataDir, channelGuid) {
    const stack = extractStack(channelGuid);
    if (!stack) {
        return { error: "unsupported_stack", channel_guid: channelGuid };
    }

    const stackFile = getStackFilePath(dataDir, stack);
    if (!fs.existsSync(stackFile)) {
        return { error: "stack_data_not_found", stack };
    }

    const data = readJsonFile(stackFile);
    let favRibbon = findFavRibbon(data);

    if (favRibbon?.tiles.some((tile) => getTileChannelId(tile) === channelGuid)) {
        const totalFavorites = addToFavoritesIndex(dataDir, stack, channelGuid, findTileByChannelId(data, channelGuid)?.tile || {});

        return {
            action: "favorited",
            stack,
            channel_guid: channelGuid,
            already_favorited: true,
            fav_count: favRibbon.tiles.length,
            total_favorites: totalFavorites,
        };
    }

    const found = findTileByChannelId(data, channelGuid);
    if (!found) {
        return { error: "team_not_found", stack, channel_guid: channelGuid };
    }

    ensureTileImage(found.tile);

    if (!favRibbon) {
        favRibbon = createFavRibbon(data.ribbons[0]);
        data.ribbons.unshift(favRibbon);
    }

    favRibbon.tiles.push(JSON.parse(JSON.stringify(found.tile)));
    updateRibbonCounts(favRibbon);
    writeJsonFile(stackFile, data);

    const totalFavorites = addToFavoritesIndex(dataDir, stack, channelGuid, found.tile);

    return {
        action: "favorited",
        stack,
        channel_guid: channelGuid,
        team_name: found.tile.team_name,
        team_abbr: found.tile.team_abbr,
        fav_count: favRibbon.tiles.length,
        total_favorites: totalFavorites,
    };
}

function unfavoriteTeam(dataDir, channelGuid) {
    const stack = extractStack(channelGuid);
    if (!stack) {
        return { error: "unsupported_stack", channel_guid: channelGuid };
    }

    const stackFile = getStackFilePath(dataDir, stack);
    if (!fs.existsSync(stackFile)) {
        return { error: "stack_data_not_found", stack };
    }

    const data = readJsonFile(stackFile);
    const favRibbon = findFavRibbon(data);

    if (!favRibbon) {
        const totalFavorites = removeFromFavoritesIndex(dataDir, channelGuid);

        return {
            action: "unfavorited",
            stack,
            channel_guid: channelGuid,
            already_unfavorited: true,
            fav_count: 0,
            total_favorites: totalFavorites,
        };
    }

    const beforeCount = favRibbon.tiles.length;
    favRibbon.tiles = favRibbon.tiles.filter((tile) => getTileChannelId(tile) !== channelGuid);

    if (favRibbon.tiles.length === beforeCount) {
        const totalFavorites = removeFromFavoritesIndex(dataDir, channelGuid);

        return {
            action: "unfavorited",
            stack,
            channel_guid: channelGuid,
            already_unfavorited: true,
            fav_count: favRibbon.tiles.length,
            total_favorites: totalFavorites,
        };
    }

    if (favRibbon.tiles.length === 0) {
        data.ribbons = data.ribbons.filter((ribbon) => !isFavRibbon(ribbon));
    } else {
        updateRibbonCounts(favRibbon);
    }

    writeJsonFile(stackFile, data);

    const found = findTileByChannelId(data, channelGuid);
    const totalFavorites = removeFromFavoritesIndex(dataDir, channelGuid);

    return {
        action: "unfavorited",
        stack,
        channel_guid: channelGuid,
        team_name: found?.tile?.team_name,
        team_abbr: found?.tile?.team_abbr,
        fav_count: favRibbon.tiles.length,
        total_favorites: totalFavorites,
    };
}

function getAllFavorites(dataDir) {
    return readFavorites(dataDir);
}

module.exports = {
    favoriteTeam,
    unfavoriteTeam,
    getAllFavorites,
    ensureTileImage,
    extractStack,
};
