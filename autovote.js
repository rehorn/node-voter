
var fs = require('fs');
var http = require('http');
var iconv = require('iconv-lite');
var async = require('async');
var _ = require('underscore');

var reqCounter = 0, // 请求数量
    proxyMaxTry = 2, // 每个ip失败重试次数
    succCounter = 0, // 成功数
    maxCounter = 10, // 最大票数限制
    useProxy = 0, // 是否使用代理
    proxyPath = './proxy.txt', // 代理列表文件
    pageChatset = 'gb2312',
    voteTimeout = 5 * 60 * 1000 + 10; // 每个ip限制时常

var headers = {
    'Referer': 'http://***.com',
    'X-FORWARDED-FOR': '8.8.8.8',
    'CLIENT-IP': '8.8.8.8'
};

var options = {
    hostname: '***.com', // direct mode
    path: '/abc/vote.aspx?id=29',
    // path: 'http://***.com/abc/vote.aspx?id=29', // proxy mode
    method: 'GET',
    headers: headers
};

var proxies = [];

var timeoutMap = {},
    statusMap = {};

function getProxyStatus(proxy){
    var proxyStatus = statusMap[proxy];
    if(!proxyStatus){
        proxyStatus = {};
        proxyStatus.succ = 0;
        proxyStatus.err = 0;
        proxyStatus.fail = 0;
        statusMap[proxy] = proxyStatus;
    }
    return proxyStatus;
}

function autoVoteRequest(proxy){
    var proxyArr = proxy.split(':');
    var pHost = proxyArr[0],
        pPort = proxyArr[1];

    var proxyStatus = getProxyStatus(proxy);

    // use proxy ?
    if(pHost != '0.0.0.0'){
        options.host = pHost;
        options.port = pPort;
    }

    var reTry = function(proxy){
        var proxyStatus = getProxyStatus(proxy);
        if(proxyStatus.err < proxyMaxTry){
            runAutoVote(proxy);
        }
    };

    var req = http.request(options, function(res) {
        
        var resBody = '';
        res.on('data', function(chunk) {
            resBody += iconv.decode(chunk, pageChatset);
        });

        res.on('end', function(){
            console.log('\n==================');
            console.log('[' + proxy + ']');
            var result = '   STATUS: ' + res.statusCode;

            if(res.statusCode == 200){
                // 成功一次，则清空失败计数
                proxyStatus.err = 0;

                // 判断成功或失败标识
                if(resBody.indexOf('投票成功') >= 0){
                    result += '   SUCCESS!';
                    proxyStatus.succ++;
                    succCounter++;
                }else{
                    result += '   FAILED!';
                    proxyStatus.fail++;
                }

            }else{
                result += '   ERROR!';
                proxyStatus.err++;
            }
            console.log(result);
            console.log('   IP-SUCCESS: ' + proxyStatus.succ);
            console.log('   IP-FAIL: ' + proxyStatus.fail);
            console.log('   IP-ERROR: ' + proxyStatus.err);
            console.log('   TOTAL-SUCCESS: ' + succCounter);

            if(res.statusCode != 200){
                reTry(proxy);
            }

            if(succCounter >= maxCounter){
                process.exit();
            }
        });

        res.socket.on('error', function(error) {
            proxyStatus.err++;
            console.log('   SOCKET ERROR: ', error);
            console.log('   IP-SUCCESS: ' + proxyStatus.succ);
            console.log('   IP-FAIL: ' + proxyStatus.fail);
            console.log('   IP-ERROR: ' + proxyStatus.err);
            console.log('   TOTAL-SUCCESS: ' + succCounter);
            reTry(proxy);
        });
    });

    req.on('error', function(e) {
        proxyStatus.err++;
        console.log('\n==================');
        console.log('[' + proxy + ']');
        console.log('   REQUEST-ERROR!');
        console.log('   IP-SUCCESS: ' + proxyStatus.succ);
        console.log('   IP-FAIL: ' + proxyStatus.fail);
        console.log('   IP-ERROR: ' + proxyStatus.err);
        console.log('   TOTAL-SUCCESS: ' + succCounter);

        reTry(proxy);
    });

    // write data to request body
    req.write('data\n');
    req.write('data\n');
    req.end();
};

function runAutoVote(proxy){

    if(timeoutMap[proxy]){
        clearInterval(timeoutMap[proxy]);
    }

    autoVoteRequest(proxy);

    timeoutMap[proxy] = setInterval(function(){
        autoVoteRequest(proxy);
    }, voteTimeout); 
};

// use proxy
if(useProxy && fs.existsSync(proxyPath)){
    var file = fs.readFileSync(proxyPath, 'utf8');
    proxies = file.split(/\r?\n/ig);
    console.log(proxies);
    proxies = _.chain(proxies).compact().uniq().value();
}else{
    proxies = ['0.0.0.0:80'];
}

async.forEach(proxies, function(proxy, err){
    runAutoVote(proxy);
});
