const Discord = require('discord.js');
const client = new Discord.Client();
const rp = require('request-promise');
const cheerio = require('cheerio');
const q = require('q');

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
        var overAllRating = 'No ratings yet in any gametypes for this season...';
        if(ratings.length > 0){
            overAllRating = ratings.reduce(function(total, r){
                return total + parseInt(r, 10);
            }) / ratings.length;
        }
        deferred.resolve(overAllRating)
    }).catch(function(err){
        console.log(err);
        deferred.reject(err)
    });

    return deferred.promise;
};

client.on('ready', (a,b,c) => {
    console.log('I am ready!');
});

client.on('message', message => {
    if(message.content.indexOf('!rank') === 0){
        var steamName = message.content.replace('!rank', '').trim();
        if(steamName.length > 0){
            getSteamId(steamName).then(function(steamId){
                getStats(steamId).then(function(data){
                    message.reply('Rating for `' + steamName + '`: ' + data);
                }).catch(function(data){
                    message.reply('Failed to get rating for `' + steamName + '`...');
                });
            }).catch(function(err){
                message.reply('Failed to get Steam Id...');
            });
        }else{
            message.reply('Please specify Steam name. Example: `!rank shroud`');
        }
    }
});

client.login(process.env['discord']);
