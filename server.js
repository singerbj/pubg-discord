const Discord = require('discord.js');
const client = new Discord.Client();
const rp = require('request-promise');
const cheerio = require('cheerio');
const q = require('q');
var LocalStorage = require('node-localstorage').LocalStorage;
var localStorage = new LocalStorage('./localStorage');

var getSteamId = function(steamName){
    var deferred = q.defer();
    const options = {
        uri: 'https://pubg.op.gg/user/' + steamName,
        transform: function (body) {
            return cheerio.load(body);
        }
    };
    rp(options).then(function ($) {
        deferred.resolve($('#userNickname').data('user_id'));
    }).catch(function (err) {
        console.log(err);
        deferred.reject(err);
    });
    return deferred.promise;
};

var getStat = function(uri){
    var deferred = q.defer();
    const options = {
        uri:uri
    };
    rp(options).then(function (data) {
        data = JSON.parse(data);
        deferred.resolve(data.stats.rating);
    }).catch(function (err) {
        if(err.statusCode === 404){
            deferred.resolve();
        }else{
            console.log(err);
            deferred.reject(err);
        }
    });
    return deferred.promise;
};

var getStats = function(steamId){
    var deferred = q.defer();
    var d = new Date();
    var year = d.getUTCFullYear().toString();
    var month = (d.getUTCMonth() + 1).toString();
    if(month.length === 1){
        month = '0' + month;
    }
    var queueSizes = ['1','2','4'];
    var modes = ['fpp', 'tpp'];
    var uris = [];
    var baseUri = 'https://pubg.op.gg/api/users/' + steamId + '/ranked-stats?season=' + year + '-' + month + '&server=na';
    queueSizes.forEach(function(q){
        modes.forEach(function(m){
            uris.push(baseUri + '&queue_size=' + q + '&mode=' + m);
        });
    });

    var promises = uris.map(function(uri){
        return getStat(uri);
    });
    q.all(promises).then(function(ratings){
        ratings = ratings.filter(function(r){
            return r !== undefined;
        });
        var overallRating = 'No ratings yet in any gametypes for this season...';
        if(ratings.length > 0){
            overallRating = ratings.reduce(function(total, r){
                return total + parseInt(r, 10);
            }) / ratings.length;
        }
        deferred.resolve(overallRating)
    }).catch(function(err){
        console.log(err);
        deferred.reject(err)
    });

    return deferred.promise;
};

var getUsernameAndStats = function(discordName, steamName){
    var deferred = q.defer();
    getSteamId(steamName).then(function(steamId){
        getStats(steamId).then(function(overallRating){
            deferred.resolve({
                discordName: discordName,
                steamName: steamName,
                overallRating: overallRating
            });
        }).catch(function(data){
            deferred.reject('Failed to get rating for `' + steamName + '`...');
        });
    }).catch(function(err){
        deferred.reject('Failed to get Steam Id...');
    });
    return deferred.promise;
};

client.on('ready', () => {
    console.log('Connected!');
});

client.on('message', message => {
    if(message.content.indexOf('!rank') === 0){
        var steamName = message.content.replace('!rank', '').trim();
        var userData = JSON.parse(localStorage.getItem(message.author.id));
        if(steamName.length > 0 || (userData && userData.steamName)){
            if(steamName.length === 0){
                steamName = JSON.parse(localStorage.getItem(message.author.id)).steamName;
            }
            getUsernameAndStats(message.author.username, steamName).then(function(data){
                message.reply('Overall rating for `' + data.steamName + '`: ' + data.overallRating);
            }).catch(function(message){
                message.reply(message);
            });
        }else{
            message.reply('Please specify Steam name or link your own to use it as a default. Example: `!rank shroud`');
        }
    }else if(message.content.indexOf('!link') === 0){
        var steamName = message.content.replace('!link', '').trim();
        localStorage.setItem(message.author.id, JSON.stringify({steamName: steamName, discordName: message.author.username}));
        message.reply('Successfully linked Discord user `' + message.author.username + '` with Steam user `' + steamName + '`');
    } else if(message.content.indexOf('!leaders') === 0) {
        if(localStorage.length > 0){
            var promises = [];
            for (var i = 0, len = localStorage.length; i < len; ++i) {
                var userData = JSON.parse(localStorage.getItem(localStorage.key(i)));
                promises.push(getUsernameAndStats(userData.discordName, userData.steamName));
            }
            q.all(promises).then(function(results){
                results.sort(function(a, b){
                    return b.overallRating < a.overallRating;
                });
                results.forEach(function(r, i){
                    message.reply((i + 1) + '. ' + r.discordName + ' (' + r.steamName + ') - ' + r.overallRating);
                });
            }).catch(function(err){
                console.log(err);
                deferred.reject('Failed to get leaders...');
            });
        }else{
            message.reply('No Steam accounts linked yet...use the `!link` command to link yours. Example: `!link shroud`');
        }
    }
});

client.login(process.env['discord']);
