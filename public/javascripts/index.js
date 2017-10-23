(function() {

    // 工具方法，获取当前DOM
    var $ = function(id) {
        if (id.indexOf('.') !== -1) {
            return document.querySelectorAll(id);
        } else {
            return document.querySelector(id);
        }
    }

    // 播放状态常量
    var PLAY_STATE = {
        STOP: 'stop',
        RUNNING: 'running',
        SUSPENDED: 'suspended'
    };

    // 播放方式常量
    var PLAY_STYLE = {
        SINGLE: 'single',
        TURN: 'turn',
        ONCE: 'once',
        RANDOM: 'random'
    }

    // DOM
    var list = $('#list');
    var playList = $('#playList');
    var listClose = $('#listClose');
    var playMask = $('#playMask');
    var playItems = $('.play-item');
    var song = $('#song');
    var singer = $('#singer');
    var post = $('#post');
    var firstSong = $('#firstSong');
    var listLength = $('#listLength');
    var start = $('#start');
    var total = $('#total');
    var state = $('#state');
    var prev = $('#prev');
    var next = $('#next');
    var pin = $('#pin');
    var bg = $('#bg');
    var out = $('#out');
    var dot = $('#dot');
    var inner = $('#inner');
    var bar = $('#bar');

    var isLoop = false;                     // 是否循环
    var playState = PLAY_STATE.STOP;        // 播放状态
    var playIndex = 0;                      // 当前播放索引
    var isListOut = false;                  // 列表是否展开
    var dragState = {};                     // 拖动数据
    var isDrag = false;                     // 是否拖动
    var dotLeft = 0;                        // 拖动游标的左侧距离
    var innerWidth = 0;                     // 播放条的宽度
    var skip = false;                       // 是否跳动播放
    var xhr = new XMLHttpRequest();         // xhr AJAX异步请求对象
    var ac = new window.AudioContext();     // AudioContext 对象
    var bufferSource = null;                // AudioBufferSourceNode对象
    var decodeSuceess = false;              // 是否解码成功
    var totalTime = 0;                      // 总时长
    var audioBuffer = null;                 // ajax获取的buffer数据
    var startInter = null;                  // 计时定时器对象
    var startSecond = 0;                    // 计时秒数

    var firstSongInfo = firstSong.textContent;  // 第一首歌的信息  
    var listLength = +listLength.textContent;   // 歌单列表长度

    /**
     * 获取应该播放的音频索引
     * @return number 索引值
     */
    function getPlayIndex() {
        if (playIndex > listLength - 1) {
            playIndex = 0;
        } else if (playIndex < 0) {
            playIndex = listLength - 1;
        }

        return playIndex;
    }

    /**
     * 计算时间
     * @param  number seconds 时间秒数
     * @return string         时间格式
     */
    function executeTime(seconds) {
        var s = Math.ceil(seconds);
        var min = Math.floor(s / 60);
        var ss = parseInt(s % 60);
        min = '0' + min;
        ss = ss < 10 ? '0' + ss : ss;
        return min + ':' + ss; 
    }

    /**
     * 渲染时间
     * @param  DOM ele    目标dom
     * @param  string format 格式
     * @return null
     */
    function renderTime(ele, format) {
        ele.textContent = format;
    }

    /**
     * 落下唱片磁头
     * @return null
     */
    function downPin() {
        pin.classList.add('pin-play');
        post.classList.add('turn-forever');
    }

    /**
     * 弹上唱片指针
     * @return null
     */
    function upPin() {
        pin.classList.remove('pin-play');
        post.classList.remove('turn-forever');
    }

    /**
     * 更新进度条
     * @param  number current 当前时间
     * @param  number total   总共时间
     * @return null
     */
    function updateProgress(current, total) {
        var percent = parseFloat(current / total);
        dotLeft = innerWidth * percent;
        out.style.width = dotLeft + 'px';
        dot.style.left = dotLeft + 'px';
    }

    /**
     * 开始播放
     * @return null
     */
    function startAudio() {
        playState = PLAY_STATE.RUNNING;

        // 放下磁头
        downPin();

        // 开始计时
        startSecond = 0;
        startInter && clearInterval(startInter);

        // 播放开始
        bufferSource.start(0);
        startSecond++;
        startInter = setInterval(function() {
            renderTime(start, executeTime(startSecond));
            updateProgress(startSecond, totalTime);
            startSecond++;
        }, 1000);
    }

    /**
     * 跳动播放
     * @param  number time 跳跃时间秒数
     * @return void
     */
    function skipAudio(time) {
        var bs = null;

        // 先释放之前的AudioBufferSourceNode对象
        // 然后再重新连接
        // 因为不允许在一个Node上start两次
        bufferSource.disconnect(ac.destination);
        bs = ac.createBufferSource();
        bs.buffer = audioBuffer;
        bs.connect(ac.destination);
        bs.onended = onPlayEnded;
        bs.start(0, time);
        bufferSource = bs;

        playState = PLAY_STATE.RUNNING;

        // 填充当前播放的时间
        renderTime(start, executeTime(time));
        startSecond = time;

        // 放下磁头
        downPin();

        // 重新开始计时
        startInter && clearInterval(startInter);
        startSecond++;
        startInter = setInterval(function() {
            renderTime(start, executeTime(startSecond));
            updateProgress(startSecond, totalTime);
            startSecond++;
        }, 1000);
    }

    /**
     * 恢复播放
     * @return null
     */
    function resumeAudio() {
        playState = PLAY_STATE.RUNNING;

        // 放下磁头
        downPin();

        // 重启定时器
        startInter && clearInterval(startInter);

        // 在当前AudioContext被挂起的状态下，才能使用resume进行重新激活
        ac.resume();
        startInter = setInterval(function() {
            renderTime(start, executeTime(startSecond));
            updateProgress(startSecond, totalTime);
            startSecond++;
        }, 1000);
    }

    /**
     * 暂停播放
     * @return null
     */
    function suspendAudio() {
        playState = PLAY_STATE.SUSPENDED;

        // 收起磁头
        upPin();

        startInter && clearInterval(startInter);

        // 挂起当前播放
        ac.suspend();
    }

    /**
     * 停止播放
     * @return null
     */
    function stopAudio() {
        playState = PLAY_STATE.STOP;

        // 收起磁头
        upPin();

        // 停止当前的bufferSource
        bufferSource && bufferSource.stop();
        startInter && clearInterval(startInter);
    }

    /**
     * 播放完成后的回调
     * @return null
     */
    function onPlayEnded() {
        var acState = ac.state;

        // 在进行上一曲和下一曲或者跳跃播放的时候
        // 如果调用stop方法，会进入当前回调，因此要作区分
        // 上一曲和下一曲的时候，由于是新的资源，因此采用关闭当前的AduioContext, load的时候重新生成
        // 这样acState的状态就是suspended，这样就不会出现播放错位
        // 而在跳跃播放的时候，由于是同一个资源，因此加上skip标志就可以判断出来
        if (acState === 'running' && !skip) {
            // 下一曲
            playIndex++;
            var index = getPlayIndex();
            loadMusic(playItems[index], index);
        }
    }

    /**
     * AudioContext 状态改变
     * @param  Event state AudioContext 状态
     * @return null
     */
    function onStateChange(state) {
        console.log('state', state);
        console.log('ac state', ac.state);
    }

    /**
     * 加载音乐
     * @param  string url 音频地址
     * @return null
     */
    function load(url) {
        xhr.open('GET', url);
        xhr.responseType = "arraybuffer";   // 返回类型为arraybuffer
        xhr.onload = function() {
            // 解码音频数据，得到一个AudioBuffer对象
            ac.decodeAudioData(xhr.response, function(buffer) {
                if (ac.state === 'closed') {
                    ac = new window.AudioContext();
                }
                audioBuffer = buffer;
                ac.onstatechange = onStateChange;
                bufferSource = ac.createBufferSource();
                decodeSuceess = true;
                bufferSource.buffer = buffer;

                // 如果循环播放，在这里设置
                bufferSource.loop = isLoop;
                bufferSource.connect(ac.destination);
                bufferSource.onended = onPlayEnded;

                // 得到总共播放时长并在页面渲染
                totalTime = bufferSource.buffer.duration;
                renderTime(total, executeTime(totalTime));

                // 如果是自动播放模式，则自动播放
                if (playState === PLAY_STATE.RUNNING) {
                    startAudio(bufferSource);
                }
            });
        }
        xhr.send();
    }

    /**
     * 重置状态
     * @param  number flag 1:表示需要关闭当前AudioContext 0:表示继续使用当前AudioContext
     *                     只有在上一曲、下一曲和列表选择歌曲的时候需要关闭当前ac
     * @return null
     */
    function reset(flag) {
        // 如果只是点击播放和暂停，则只调用stop函数
        // 上一曲、下一曲释放资源
        if (playState === PLAY_STATE.RUNNING && !flag) {
            bufferSource && bufferSource.stop();
        } else {
            ac && ac.close();
            bufferSource = null;
        }

        // 解码成功置为false
        decodeSuceess = false;

        // 定时器开始时间为0
        startSecond = 0;

        // 重置开始时间和总共时间
        renderTime(start, executeTime(0));
        renderTime(total, executeTime(0));

        // 重置进度条
        out.style.width = 0;
        dot.style.left = 0;
    }

    /**
     * 加载音频
     * @param  DOM item  当前点击的DOM
     * @param  number index 当前点击的索引
     * @param  number flag  1:表示需要关闭当前AudioContext 0:表示继续使用当前AudioContext
     * @return null
     */
    function loadMusic(item, index, flag) {
        // 加载新音频的时候重置状态
        reset(flag);

        // 设置当前播放的音频索引
        playIndex = index;

        // 获取音频信息
        var itemSong = item.getAttribute('data-song');
        var itemSinger = item.getAttribute('data-singer');
        var itemPost = item.getAttribute('data-post');
        var name = item.getAttribute('data-name');

        // 显示音频信息
        song.textContent = itemSong;
        singer.textContent = itemSinger;
        post.src = '/images/' + itemPost;
        bg.style.backgroundImage = 'url("/images/'+ itemPost +'")';

        // 如果列表为展开状态，则关闭
        isListOut && down();

        // 加载音频
        load('/media/' + name);
    }

    /**
     * 播放列表移出
     * @return null
     */
    function up() {
        isListOut = true;
        playList.classList.remove('down');
        playList.classList.add('up');
    }

    /**
     * 播放列表移下
     * @return null
     */
    function down() {
        isListOut = false;
        playList.classList.remove('up');
        playList.classList.add('down');
    }

    /**
     * 初始化事件
     * @return null
     */
    function initEvents() {
        list.addEventListener('click', up);
        listClose.addEventListener('click', down);
        playMask.addEventListener('click', down);

        // 播放列表点击
        [].slice.call(playItems).forEach(function(item, index) {
            item.addEventListener('click', function() {
                loadMusic(this, index, 1);
            });
        });

        // 开始/暂停播放
        state.addEventListener('click', function() {
            var className = this.className;
            var canPlay = className.indexOf('play') !== -1;
            var state = ac.state;
            if (canPlay) {
                this.classList.remove('play');
                this.classList.add('pause');

                if (decodeSuceess && state === 'running') {
                    startAudio(bufferSource);
                } else if (state === 'suspended') {
                    resumeAudio();
                }
            } else {
                this.classList.remove('pause');
                this.classList.add('play');

                suspendAudio();
            }
        });

        // 上一曲
        prev.addEventListener('click', function() {
            playIndex--;
            var index = getPlayIndex();
            loadMusic(playItems[index], index, 1);
        });

        // 下一曲
        next.addEventListener('click', function() {
            playIndex++;
            var index = getPlayIndex();
            loadMusic(playItems[index], index, 1);
        });

        // dot的拖拽事件
        dot.addEventListener('touchstart', function(e) {
            if (isDrag) {
                return;
            }

            skip = true;
            startSecond > 0 && stopAudio();

            var touch = e.touches[0];
            var startX = touch.clientX;
            dragState.startX = startX;
            isDrag = true;
        }); 

        dot.addEventListener('touchmove', function(e) {
            if (!isDrag) {
                return;
            }
            e.preventDefault();

            var touch = e.touches[0];
            var currentX = touch.clientX;
            var offsetX = currentX - dragState.startX;

            var moveLeft = Math.max(0, Math.min(dotLeft + offsetX, innerWidth));
            dot.style.left = moveLeft + 'px';
            out.style.width = moveLeft + 'px';

            dragState.moveLeft = moveLeft;
        }, { passive: false });

        dot.addEventListener('touchend', function(e) {
            if (!isDrag) {
                return;
            }

            var percent = parseFloat(dragState.moveLeft / innerWidth);
            var skipTime = Math.floor(percent * totalTime);
            dotLeft = dragState.moveLeft;
            skip = false;

            skipAudio(skipTime);

            isDrag = false;
            dragState = {};
        });

        // 进度条点击
        bar.addEventListener('touchstart', function(e) {
            var touch = e.touches[0];
            var pageX = touch.pageX;
            var left = bar.getBoundingClientRect().left;
            var moveLeft = pageX - left;
            var percent = parseFloat(moveLeft / innerWidth);
            var skipTime = Math.floor(percent * totalTime);
            dot.style.left = moveLeft + 'px';
            out.style.width = moveLeft + 'px';
            skipAudio(skipTime);
        });
    }

    function init() {
        // 加载第一首
        load('/media/' + firstSongInfo);

        // 设置进度条总共宽度
        innerWidth = inner.clientWidth;
    }

    function mounted() {
        initEvents();
        init();
    }

    document.addEventListener('DOMContentLoaded', mounted);

})();