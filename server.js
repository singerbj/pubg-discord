const Discord = require("discord.js");
const client = new Discord.Client();
const rp = require("request-promise");
const cheerio = require("cheerio");
const q = require("q");
var LocalStorage = require("node-localstorage").LocalStorage;
var localStorage = new LocalStorage("./localStorage");

var rand = function(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min)) + min;
};

var getPUBGId = function(pubgName) {
    var deferred = q.defer();
    const options = {
        uri: "https://pubg.op.gg/user/" + pubgName,
        transform: function(body) {
            return cheerio.load(body);
        }
    };
    rp(options)
        .then(function($) {
            deferred.resolve($("#userNickname").data("user_id"));
        })
        .catch(function(err) {
            console.log(err);
            deferred.reject(err);
        });
    return deferred.promise;
};

var getStat = function(uri) {
    var deferred = q.defer();
    const options = {
        uri: uri
    };
    rp(options)
        .then(function(data) {
            data = JSON.parse(data);
            deferred.resolve(data.stats.rating);
        })
        .catch(function(err) {
            if (err.statusCode === 404) {
                deferred.resolve();
            } else {
                console.log(err);
                deferred.reject(err);
            }
        });
    return deferred.promise;
};

var getStats = function(pubgId) {
    var deferred = q.defer();
    var d = new Date();
    var year = d.getUTCFullYear().toString();
    var month = (d.getUTCMonth() + 1).toString();
    if (month.length === 1) {
        month = "0" + month;
    }
    var queueSizes = ["1", "2", "4"];
    var modes = ["fpp", "tpp"];
    var uris = [];
    var baseUri = "https://pubg.op.gg/api/users/" + pubgId + "/ranked-stats?season=" + year + "-" + month + "&server=na";
    queueSizes.forEach(function(q) {
        modes.forEach(function(m) {
            uris.push(baseUri + "&queue_size=" + q + "&mode=" + m);
        });
    });

    var promises = uris.map(function(uri) {
        return getStat(uri);
    });
    q
        .all(promises)
        .then(function(ratings) {
            ratings = ratings.filter(function(r) {
                return r !== undefined;
            });
            var overallRating = "No ratings yet in any gametypes for this season...";
            if (ratings.length > 0) {
                overallRating =
                    ratings.reduce(function(total, r) {
                        return total + parseInt(r, 10);
                    }) / ratings.length;
            }
            deferred.resolve(overallRating);
        })
        .catch(function(err) {
            console.log(err);
            deferred.reject(err);
        });

    return deferred.promise;
};

var getUsernameAndStats = function(discordName, pubgName) {
    var deferred = q.defer();
    getPUBGId(pubgName)
        .then(function(pubgId) {
            getStats(pubgId)
                .then(function(overallRating) {
                    deferred.resolve({
                        discordName: discordName,
                        pubgName: pubgName,
                        overallRating: overallRating
                    });
                })
                .catch(function(data) {
                    deferred.reject("Failed to get rating for `" + pubgName + "`...");
                });
        })
        .catch(function(err) {
            deferred.reject("Failed to get PUBG Id...");
        });
    return deferred.promise;
};

client.on("ready", () => {
    console.log("Connected!");
});

client.on("message", message => {
    if (message.content.indexOf("!rank") === 0) {
        var pubgName = message.content.replace("!rank", "").trim();
        var userData = JSON.parse(localStorage.getItem(message.author.id));
        if (pubgName.length > 0 || (userData && userData.pubgName)) {
            if (pubgName.length === 0) {
                pubgName = JSON.parse(localStorage.getItem(message.author.id)).pubgName;
            }
            getUsernameAndStats(message.author.username, pubgName)
                .then(function(data) {
                    message.reply(`
                        Overall rating for \`${data.pubgName}\`: ${data.overallRating}

                        More stats here: https://pubg.op.gg/user/${data.pubgName}
                        `);
                })
                .catch(function(message) {
                    message.reply(message);
                });
        } else {
            message.reply("Please specify PUBG name or link your own to use it as a default. Example: `!rank shroud`");
        }
    } else if (message.content.indexOf("!link") === 0) {
        var pubgName = message.content.replace("!link", "").trim();
        localStorage.setItem(
            message.author.id,
            JSON.stringify({
                pubgName: pubgName,
                discordName: message.author.username
            })
        );
        message.reply("Successfully linked Discord user `" + message.author.username + "` with PUBG user `" + pubgName + "`");
    } else if (message.content.indexOf("!leaders") === 0) {
        if (message.guild) {
            if (localStorage.length > 0) {
                var memberIds = message.guild.members.map(function(m) {
                    return m.id;
                });
                var promises = [];
                for (var i = 0, len = localStorage.length; i < len; ++i) {
                    if (memberIds.indexOf(localStorage.key(i)) > -1) {
                        var userData = JSON.parse(localStorage.getItem(localStorage.key(i)));
                        promises.push(getUsernameAndStats(userData.discordName, userData.pubgName));
                    }
                }
                if (promises.length > 0) {
                    q
                        .all(promises)
                        .then(function(results) {
                            results = results.sort(function(a, b) {
                                return b.overallRating - a.overallRating;
                            });
                            var string = "";
                            results.forEach(function(r, i) {
                                string = i + 1 + ". " + r.discordName + " (" + r.pubgName + ") - " + r.overallRating + "\n";
                            });
                            message.reply(string);
                        })
                        .catch(function(err) {
                            message.reply("Failed to get leaders...");
                        });
                } else {
                    message.reply("No PUBG accounts linked yet...use the `!link` command to link yours. Example: `!link shroud`");
                }
            } else {
                message.reply("No PUBG accounts linked yet...use the `!link` command to link yours. Example: `!link shroud`");
            }
        } else {
            message.reply("This command only works if run in a server channel.");
        }
    } else if (message.content.indexOf("!coin") === 0) {
        message.reply(rand(0, 2) === 1 ? "Heads" : "Tails", {
            reply: false
        });
    } else if (message.content.indexOf("!dice") === 0) {
        var sides = parseInt(message.content.replace("!dice", "").trim(), 10);
        if (isNaN(sides) || sides < 0) {
            message.reply("Please specify a valid number for the `!dice` command...");
        } else {
            message.reply(rand(0, sides + 1));
        }
    } else if (message.content.indexOf("!help") === 0) {
        message.reply(`
            \`!rank {username}\`
                Gets the overall player rating for a user with the specified PUBG name, or the user's linked account by default.
            \`!leaders\`
                Ranks all the players in the discord server by overall player rating.
            \`!link {pubg username}\`
                Links a PUBG name to a Discord user for use with the !rank and !leaders commands.
            \`!coin\`
                Flips a coin.
            \`!dice {number of sides on die}\`
                Rolls a die based on the number of sides that you specify
            \`!help\`
                Displays the commands and what they do.
            `);
    }
});

client.login(process.env["discord"]);
