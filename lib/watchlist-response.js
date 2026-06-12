const crypto = require("crypto");

const RENO_RIBBONS = [
    "my_tv/favorite_channels",
    "my_tv_tvod/favorite_channels",
    "home/my_most_watched_channels",
    "player_screen/player_favorites",
    "player_screen/favorite_channels",
    "favorite_channels",
    "home/my_fav_channels",
    "my_favorites_channels",
];

const PROFILE_GUID = "804fc3b0-6b5f-11f1-9f90-7a7bc35467e0";

function getRenoOperation(action, result) {
    if (action === "favorite") {
        return result.already_favorited ? "delete" : "add";
    }

    return result.already_unfavorited ? "add" : "delete";
}

function buildWatchlistResponse(channelGuid, action, result) {
    const operation = getRenoOperation(action, result);

    return {
        reno_data: {
            data: {
                ribbons: [],
                screens: [],
                tiles: [],
                profiles: [
                    {
                        profile_guid: PROFILE_GUID,
                        screens: ["fluid-guide"],
                        ribbons: [...RENO_RIBBONS, `detail/channel/${channelGuid}/actions`],
                        tiles: [channelGuid, channelGuid],
                        pages: ["fluid-guide"],
                        "user-data": [
                            {
                                ids: [channelGuid],
                                operation,
                                personalization: "favorite_channel",
                            },
                        ],
                    },
                ],
            },
            id: crypto.randomUUID(),
        },
    };
}

module.exports = {
    buildWatchlistResponse,
    getRenoOperation,
};
