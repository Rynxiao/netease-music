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
    var PLAY_MODE = {
        SINGLE: 'single',
        TURN: 'turn',
        RANDOM: 'random'
    };

    // 播放模式的顺序
    var playSequence = [ PLAY_MODE.SINGLE, PLAY_MODE.TURN, PLAY_MODE.RANDOM ];

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
    var loop = $('#loop');
    var listLoop = $('#listLoop');
    var canvasDOM = $('#canvas');
    var content = $('#content');

    var playState = PLAY_STATE.STOP;                // 播放状态
    var prevIndex = null;                           // 上一曲索引
    var nextIndex = null;                           // 下一曲索引
    var playIndex = 0;                              // 当前播放索引
    var playMode = PLAY_MODE.TURN;                  // 播放模式
    var isLoop = playMode === PLAY_MODE.SINGLE;     // 是否循环
    var isListOut = false;                          // 列表是否展开
    var dragState = {};                             // 拖动数据
    var isDrag = false;                             // 是否拖动
    var dotLeft = 0;                                // 拖动游标的左侧距离
    var innerWidth = 0;                             // 播放条的宽度
    var skip = false;                               // 是否跳动播放
    var caps = [];

    var xhr = new XMLHttpRequest();                 // xhr AJAX异步请求对象
    var ac = new window.AudioContext();             // AudioContext 对象
    var bufferSource = null;                        // AudioBufferSourceNode对象
    var analyser = null;                            // 分析节点
    var fftSize = 256;

    var ctx = null;                                 // canvas上下文对象
    var canvasWidth = 0;                            // 
    var canvasHeight = 0;                           //
    var decodeSuceess = false;                      // 是否解码成功
    var totalTime = 0;                              // 总时长
    var audioBuffer = null;                         // ajax获取的buffer数据
    var startInter = null;                          // 计时定时器对象
    var startSecond = 0;                            // 计时秒数
    var renderInter = null;                         //

    var firstSongInfo = firstSong.textContent;      // 第一首歌的信息  
    var listLength = +listLength.textContent;       // 歌单列表长度

    function getCaps() {
        for (var i = 0; i < fftSize / 2; i++) {
            caps.push(0);
        }
        return caps;
    }

    /**
     * 获取随机的音频索引
     * @return number 随机索引值
     */
    function getRandomIndex(length) {
        var random = parseInt(Math.random() * length);
        return random === length ? random - 1 : random;
    }

    /**
     * 生成索引
     * @param  number playIndex 播放索引
     * @return number           索引
     */
    function generateIndex(playIndex) {
        var allIndex = [];
        var aviableList = [];
        var random;

        for (var i = 0; i < listLength; i++) {
            allIndex.push(i);
        }

        aviableList = allIndex.filter(function(item) {
            return item !== playIndex;
        });

        random = getRandomIndex(aviableList.length);
        return aviableList[random];
    }

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
     * 改变播放模式
     * @return void(0)
     */
    function handlePlayMode() {
        if (playMode === PLAY_MODE.SINGLE && bufferSource) {
            bufferSource.loop = true;
        }
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
        bufferSource && bufferSource.start(0);

        // 开始分析
        getByteFrequencyData();

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
        // 先释放之前的AudioBufferSourceNode对象
        // 然后再重新连接
        // 因为不允许在一个Node上start两次
        analyser && analyser.disconnect(ac.destination);
        bufferSource = ac.createBufferSource();
        bufferSource.buffer = audioBuffer;
        analyser = ac.createAnalyser();
        analyser.fftSize = fftSize;
        bufferSource.connect(analyser);
        analyser.connect(ac.destination);
        bufferSource.onended = onPlayEnded;
        bufferSource.start(0, time);

        playState = PLAY_STATE.RUNNING;
        changeSuspendBtn();

        // 开始分析
        getByteFrequencyData();

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

        // 在当前AudioContext被挂起的状态下，才能使用resume进行重新激活
        ac.resume();

        // 重新恢复可视化
        resumeRenderCanvas();

        // 重启定时器
        startInter && clearInterval(startInter);
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

        // 停止可视化
        stopRenderCanvas();

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

        // 停止可视化
        stopRenderCanvas();

        // 收起磁头
        upPin();

        console.log('stop Audio');
        console.log('bufferSource', bufferSource);

        // 停止当前的bufferSource
        bufferSource && bufferSource.stop();
        bufferSource = null;
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
        // 发现如果是循环播放，onPlayEnded方法不会被执行，因此采用加载相同索引的方式
        
        if (acState === 'running' && !skip) {
            var index = getNextPlayIndex();
            loadMusic(playItems[index], index);
        }
    }

    /**
     * AudioContext 状态改变
     * @param  Event state AudioContext 状态
     * @return null
     */
    function onStateChange(state) {
        // console.log('state', state);
        // console.log('ac state', ac.state);
    }

    /**
     * canvas可视化音频
     * @param  Array arr 数据数组
     * @return void
     */
    function renderCanvas(arr) {
        var len = arr.length;
        var w = Math.floor(canvasWidth / 128);
        var capH = w;

        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        arr.forEach(function(h, index) {
            h = h * 2.5;
            var x = w * index;
            var y = canvasHeight - h;
            cap = caps[index];

            if (y <= 0) {
                y = 0;
            }

            // 渲染柱状条
            ctx.beginPath();
            ctx.fillRect(x, y, w - 1, h);
            ctx.closePath();

            // 渲染点
            ctx.beginPath();
            ctx.fillRect(x, canvasHeight - (cap + capH), w - 1, capH);
            ctx.closePath();

            // 改变点的位置
            caps[index] = cap - 1;

            if (caps[index] < 0) {
                caps[index] = 0;
            }

            if (h > 0 && caps[index] < h + 40) {
                caps[index] = h + 40;
            }
        });
    }

    /**
     * 恢复渲染Canvas
     * @return void
     */
    function resumeRenderCanvas() {
        if (!renderInter) {
            renderInter = window.requestAnimationFrame(getByteFrequencyData);
        }
    }

    /**
     * 停止渲染Canvas
     * @return void
     */
    function stopRenderCanvas() {
        renderInter && window.cancelAnimationFrame(renderInter);
        renderInter = null;
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    }

    /**
     * 获取音频解析数据
     * @return void
     */
    function getByteFrequencyData() {
        var arr = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(arr);
        renderCanvas(arr);

        renderInter = window.requestAnimationFrame(getByteFrequencyData);
    }

    /**
     * 创建音频
     * @param  AudioBuffer buffer AudioBuffer对象
     * @return void
     */
    function createAudio(buffer) {
        if (ac.state === 'closed') {
            ac = new window.AudioContext();
        }
        audioBuffer = buffer;
        ac.onstatechange = onStateChange;
        bufferSource = ac.createBufferSource();
        analyser = ac.createAnalyser();
        analyser.fftSize = fftSize;

        bufferSource.buffer = buffer;
        bufferSource.onended = onPlayEnded;

        bufferSource.connect(analyser);
        analyser.connect(ac.destination);
    }

    /**
     * 加载音乐
     * @param  string url 音频地址
     * @return null
     */
    function load(url) {
        var className = state.className;
        state.classList.remove(className);
        state.classList.add('loading');

        xhr.open('GET', url);
        xhr.responseType = "arraybuffer";   // 返回类型为arraybuffer
        xhr.onload = function() {
            decodeSuceess = false;
            state.classList.remove('loading');
            state.classList.add(className);
            
            // 解码音频数据，得到一个AudioBuffer对象
            ac.decodeAudioData(xhr.response, function(buffer) {
                createAudio(buffer);
                decodeSuceess = true;

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
        // 解码成功置为false
        decodeSuceess = false;

        // 重置画布
        stopRenderCanvas();

        // 如果只是点击播放和暂停，则只调用stop函数
        // 上一曲、下一曲释放资源
        if (playState === PLAY_STATE.RUNNING && !flag) {
            bufferSource && bufferSource.stop();
        } else {
            ac && ac.close();
            bufferSource = null;
        }

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
        load('http://oyo3prim6.bkt.clouddn.com/' + name);
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
     * 获取上一曲的播放索引
     * @return number 返回的索引
     */
    function getPrevPlayIndex() {
        var index;

        if (playMode === PLAY_MODE.RANDOM) {
            if (typeof prevIndex !== 'number') {
                index = generateIndex(playIndex);
                nextIndex = playIndex;
            } else {
                index = prevIndex;
                prevIndex = null;
            }
            playIndex = index;
        } else {
            playIndex--;
            index = getPlayIndex();
        }

        return index;
    }

    /**
     * 获取下一曲的播放索引
     * @return number 返回的索引
     */
    function getNextPlayIndex() {
        var index;

        if (playMode === PLAY_MODE.RANDOM) {
            if (typeof nextIndex !== 'number') {
                index = generateIndex(playIndex);
                prevIndex = playIndex;
            } else {
                index = nextIndex;
                nextIndex = null;
            }
            playIndex = index;
        } else if (playMode === PLAY_MODE.SINGLE) {
            index = playIndex;
        } else {
            playIndex++;
            index = getPlayIndex();
        }

        return index;
    }

    /**
     * 获取子节点
     * @param  DOM dom DOM节点
     * @return DOMList     DOM节点列表
     */
    function getChildNode(dom) {
        var domList = [].slice.call(dom.childNodes).filter(function(d) {
            return d.nodeType === 1;
        });
        return domList;
    }

    /**
     * 改变播放模式
     * @param  DOM currentDom 当前点击DOM
     * @param  DOM nextDom    另外点击DOM
     * @return void
     */
    function changePlayMode(currentDom, nextDom) {
        var child = getChildNode(currentDom)[0];
        var className = child.className;
        var mode = className.match(/^loop\s*(\w+)/)[1];
        var index = playSequence.indexOf(mode);

        var listChild = getChildNode(nextDom)[0];
        var isListMode = currentDom.className.indexOf('title') !== -1;
        var loopText = $('#loopText');

        index++;
        if (index > 2) {
            index = 0;
        }

        var newMode = playSequence[index];
        playMode = PLAY_MODE[newMode.toUpperCase()];

        child.classList.remove(mode);
        child.classList.add(newMode);

        listChild.classList.remove(mode);
        listChild.classList.add(newMode);

        if (isListMode) {
            if (newMode === 'single') {
                loopText.textContent = '单曲循环';
            } else if (newMode === 'turn') {
                loopText.textContent = '列表循环(' + listLength + ')';
            } else {
                loopText.textContent = '随机播放(' + listLength + ')';
            }
        }
    }

    /**
     * 切换到播放状态的UI
     * @return void
     */
    function changePlayBtn() {
        state.classList.remove('pause');
        state.classList.add('play');
    }

    /**
     * 切换到暂停状态的UI
     * @return void
     */
    function changeSuspendBtn() {
        state.classList.remove('play');
        state.classList.add('pause');
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
            if (decodeSuceess) {
                if (canPlay) {
                    changeSuspendBtn();

                    if (state === 'running') {
                        startAudio(bufferSource);
                    } else if (state === 'suspended') {
                        resumeAudio();
                    }
                } else {
                    changePlayBtn();
                    suspendAudio();
                }
            }
        });

        // 上一曲
        prev.addEventListener('click', function() {
            var index = getPrevPlayIndex();
            loadMusic(playItems[index], index, 1);
        });

        // 下一曲
        next.addEventListener('click', function() {
            var index = getNextPlayIndex();
            loadMusic(playItems[index], index, 1);
        });

        // dot的拖拽事件
        dot.addEventListener('touchstart', function(e) {
            if (isDrag) {
                return;
            }

            skip = true;
            console.log(startSecond);
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
            var target = e.target;
            var isDot = target.className.indexOf('dot') !== -1;

            if (isDot) {
                return;
            }

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

        // 播放模式切换
        loop.addEventListener('click', function() {
            changePlayMode(this, listLoop);
        });
        listLoop.addEventListener('click', function() {
            changePlayMode(this, loop);
        });

        // 内容区域点击
        content.addEventListener('click', function() {
            var childNodes = getChildNode(this);
            childNodes.forEach(function(child) {
                var className = child.className;
                if (className.indexOf('show') !== -1) {
                    child.classList.remove('show');
                } else {
                    child.classList.add('show');
                }
            });
        });
    }

    function initialCanvas() {
        // canvas高度
        var width = canvasDOM.clientWidth;
        var height = canvasDOM.clientHeight;
        canvasDOM.width = width;
        canvasDOM.height = height;
        canvasWidth = width;
        canvasHeight = height;
        ctx = canvasDOM.getContext('2d');

        var grd = ctx.createLinearGradient(0, 0, 0, height);
        grd.addColorStop(0, 'red');
        grd.addColorStop(0.5, 'yellow');
        grd.addColorStop(1, 'green');
        ctx.fillStyle = grd;
    }

    function init() {
        // 加载第一首
        load('http://oyo3prim6.bkt.clouddn.com/' + firstSongInfo);

        // 设置进度条总共宽度
        innerWidth = inner.clientWidth;

        initialCanvas();

        caps = getCaps();
    }

    function mounted() {
        initEvents();
        init();
    }

    document.addEventListener('DOMContentLoaded', mounted);

})();