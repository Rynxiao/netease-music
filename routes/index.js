var express = require('express');
var router = express.Router();
var path = require('path');
var media = path.join(__dirname, '../public/media');
var fs = require('fs');

var listPosts = [
    'c4.jpeg', 'c2.jpeg', 'c3.jpeg', 'c1.jpeg'
];

/* GET home page. */
router.get('/', function(req, res, next) {
    fs.readdir(media, function(err, names) {
        names = names.slice(1);
        var first = names[0];
        var song = first.split(' - ')[1].replace('.mp3', '');
        var singer = first.split(' - ')[0];

        if (err) {
            console.log(err);
        } else {
            res.render('index', { 
                title: '网易云音乐', 
                music: names, 
                posts: listPosts,
                song: song,
                singer: singer,
                post: listPosts[0] 
            });
        }
    });
});

module.exports = router;
