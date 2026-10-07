// Silence Remover Pro — Panel JS v4
'use strict';

var cs = null; // csInterface
var isProcessing = false;
var startTime = null;
var timerInterval = null;
var seqPollInterval = null;
var lastSeqName = '';
var previewRegions = [];
var targetTrackIndex = 0;

var fsNode = null;
try {
    if (typeof window !== 'undefined' && window.require) {
        fsNode = window.require('fs');
    } else if (typeof require !== 'undefined') {
        fsNode = require('fs');
    }
} catch(e) {
    console.warn("Node.js 'fs' module is not available.");
}

function analyzeWavFile(filePath, thresholdDB, minSilenceSec) {
    if (!fsNode) {
        throw new Error('Node.js dosya sistemi erişimi aktif değil.');
    }
    
    var buffer = fsNode.readFileSync(filePath);
    
    if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
        throw new Error('Geçerli bir WAV dosyası bulunamadı.');
    }
    
    var offset = 12;
    var numChannels = 2;
    var sampleRate = 48000;
    var bitsPerSample = 16;
    var dataOffset = 0;
    var dataSize = 0;
    
    while (offset < buffer.length - 8) {
        var chunkId = buffer.toString('ascii', offset, offset + 4);
        var chunkSize = buffer.readUInt32LE(offset + 4);
        if (chunkId === 'fmt ') {
            numChannels = buffer.readUInt16LE(offset + 8 + 2);
            sampleRate = buffer.readUInt32LE(offset + 8 + 4);
            bitsPerSample = buffer.readUInt16LE(offset + 8 + 14);
        } else if (chunkId === 'data') {
            dataOffset = offset + 8;
            dataSize = chunkSize;
            break;
        }
        offset += 8 + chunkSize;
    }
    
    if (dataOffset === 0) {
        throw new Error('Ses verisi (data chunk) bulunamadı.');
    }
    
    var sampleBytes = bitsPerSample / 8;
    var frameBytes = numChannels * sampleBytes;
    var totalFrames = Math.floor(dataSize / frameBytes);
    
    var windowSec = 0.02; // 20ms
    var framesPerWindow = Math.floor(sampleRate * windowSec);
    var totalWindows = Math.floor(totalFrames / framesPerWindow);
    
    var silentWindows = [];
    var dbValues = [];
    var maxVal = Math.pow(2, bitsPerSample - 1);
    
    for (var w = 0; w < totalWindows; w++) {
        var sumSquares = 0;
        var count = 0;
        var startFrame = w * framesPerWindow;
        
        for (var f = 0; f < framesPerWindow; f++) {
            var frameIndex = startFrame + f;
            var byteIndex = dataOffset + frameIndex * frameBytes;
            if (byteIndex + frameBytes > buffer.length) break;
            
            var val = 0;
            if (bitsPerSample === 16) {
                val = buffer.readInt16LE(byteIndex);
            } else if (bitsPerSample === 8) {
                val = buffer.readUInt8(byteIndex) - 128;
            } else if (bitsPerSample === 24) {
                val = (buffer[byteIndex] | (buffer[byteIndex+1] << 8) | (buffer[byteIndex+2] << 16));
                if (val & 0x800000) val |= 0xFF000000;
            } else if (bitsPerSample === 32) {
                val = buffer.readFloatLE(byteIndex) * 32768;
            }
            
            sumSquares += val * val;
            count++;
        }
        
        var rms = Math.sqrt(sumSquares / count);
        var db = -100;
        if (rms > 0) {
            if (Math.log10) {
                db = 20 * Math.log10(rms / maxVal);
            } else {
                db = 20 * (Math.log(rms / maxVal) / Math.LN10);
            }
        }
        
        silentWindows.push(db < thresholdDB);
        dbValues.push(db);
    }
    
    var regions = [];
    var inSilence = false;
    var silenceStart = 0;
    
    for (var i = 0; i < silentWindows.length; i++) {
        var timeSec = i * windowSec;
        if (silentWindows[i]) {
            if (!inSilence) {
                inSilence = true;
                silenceStart = timeSec;
            }
        } else {
            if (inSilence) {
                inSilence = false;
                var duration = timeSec - silenceStart;
                if (duration >= minSilenceSec) {
                    regions.push({ start: silenceStart, end: timeSec, duration: duration });
                }
            }
        }
    }
    
    if (inSilence) {
        var timeSec = silentWindows.length * windowSec;
        var duration = timeSec - silenceStart;
        if (duration >= minSilenceSec) {
            regions.push({ start: silenceStart, end: timeSec, duration: duration });
        }
    }
    
    // Calculate stats
    var maxDb = -100;
    var sumDb = 0;
    var countDb = 0;
    var sortedDbs = [];
    for (var i = 0; i < dbValues.length; i++) {
        var d = dbValues[i];
        if (d > -90) {
            if (d > maxDb) maxDb = d;
            sumDb += d;
            countDb++;
            sortedDbs.push(d);
        }
    }
    
    var avgDb = countDb > 0 ? (sumDb / countDb) : -100;
    sortedDbs.sort(function(a, b) { return a - b; });
    var noiseFloorIdx = Math.floor(sortedDbs.length * 0.1);
    var noiseFloor = sortedDbs.length > 0 ? sortedDbs[noiseFloorIdx] : -100;
    
    return {
        regions: regions,
        maxDb: maxDb,
        avgDb: avgDb,
        noiseFloor: noiseFloor
    };
}

function safeJSON(str, ctx) {
    if (!str || typeof str !== 'string') { log('Boş yanıt ('+(ctx||'')+')', 'warn'); return null; }
    if (str.indexOf('EvalScript error') >= 0) { log('ExtendScript hatası ('+(ctx||'')+'): '+str.substring(0,200), 'error'); return null; }
    try { return JSON.parse(str); }
    catch(e) { log('Parse hatası ('+(ctx||'')+'): '+str.substring(0,200), 'error'); return null; }
}

document.addEventListener('DOMContentLoaded', function() {
    try {
        cs = new CSInterface();
        setTimeout(function() {
            cs.evalScript('"ping"', function(r1) {
                log('CEP bağlantısı: '+(r1==='"ping"'?'✓':'?? '+r1), r1==='"ping"'?'success':'warn');
                cs.evalScript('typeof srTest', function(r2) {
                    log('host.jsx: '+(r2==='function'?'✓ yüklendi':'✗ '+r2), r2==='function'?'success':'error');
                    if (r2 !== 'function') { setSeqStatus(false, 'host.jsx yüklenemedi'); return; }
                    cs.evalScript('srTestApp()', function(r3) {
                        log('App: '+r3, (r3&&r3.indexOf('seq:')===0)?'success':'warn');
                        refreshSeq();
                        startSeqPoll();
                    });
                });
            });
        }, 600);
    } catch(e) {
        log('CSInterface hatası: '+e.message, 'warn');
        cs = null; setSeqStatus(false, 'Demo Modu');
    }
    initSliders();
    drawPlaceholder();
});

// Sekans değişimini 2 saniyede bir kontrol et
function startSeqPoll() {
    if (seqPollInterval) clearInterval(seqPollInterval);
    seqPollInterval = setInterval(function() {
        if (!cs || isProcessing) return;
        cs.evalScript('getSequenceInfo()', function(raw) {
            var info = safeJSON(raw, 'poll');
            if (!info) return;
            if (info.success && info.name !== lastSeqName) {
                lastSeqName = info.name;
                setSeqStatus(true, info.name, info.clipCount, info.duration);
                log('Sekans değişti: '+info.name, 'info');
            } else if (!info.success && lastSeqName !== '') {
                lastSeqName = '';
                setSeqStatus(false, info.error || 'Sekans yok');
            }
        });
    }, 2000);
}

function refreshSeq() {
    if (!cs) return;
    cs.evalScript('getSequenceInfo()', function(raw) {
        var info = safeJSON(raw, 'refreshSeq');
        if (!info) { setSeqStatus(false, 'Yanıt alınamadı'); return; }
        if (info.success) {
            lastSeqName = info.name;
            setSeqStatus(true, info.name, info.clipCount, info.duration);
            log('Sekans: '+info.name+' ('+info.clipCount+' klip)', 'info');
        } else {
            setSeqStatus(false, info.error || 'Sekans yok');
            log(info.error || 'Aktif sekans yok', 'warn');
        }
    });
}

document.getElementById('btnRefresh').addEventListener('click', refreshSeq);

function setSeqStatus(active, name, clipCount, duration) {
    var dot = document.getElementById('seqDot');
    var nameEl = document.getElementById('seqName');
    dot.className = 'seq-dot '+(active?'active':'warn');
    if (active) {
        var dur = duration ? ' · '+formatTime(duration) : '';
        nameEl.innerHTML = '<span>'+escHtml(name)+'</span>'+(clipCount?' · '+clipCount+' klip':'')+dur;
    } else {
        nameEl.textContent = name || 'Sekans yok';
    }
}

var sliderDefs = [
    {s:'sliderThreshold', f:'fillThreshold', v:'valThreshold', min:-80, max:-10, fmt:function(v){return v+' dB';}},
    {s:'sliderMinSilence',f:'fillMinSilence',v:'valMinSilence',min:0.1, max:3.0, fmt:function(v){return parseFloat(v).toFixed(2)+' s';}},
    {s:'sliderPadBefore', f:'fillPadBefore', v:'valPadBefore', min:0,   max:0.5, fmt:function(v){return parseFloat(v).toFixed(2)+' s';}},
    {s:'sliderPadAfter',  f:'fillPadAfter',  v:'valPadAfter',  min:0,   max:0.5, fmt:function(v){return parseFloat(v).toFixed(2)+' s';}}
];

function initSliders() {
    sliderDefs.forEach(function(d) {
        var sl=document.getElementById(d.s), fi=document.getElementById(d.f), va=document.getElementById(d.v);
        function upd(){ var p=((sl.value-d.min)/(d.max-d.min))*100; fi.style.width=p+'%'; va.textContent=d.fmt(sl.value); }
        sl.addEventListener('input', upd); upd();
        var drag=false,sy,sv;
        va.addEventListener('mousedown',function(e){drag=true;sy=e.clientY;sv=parseFloat(sl.value);e.preventDefault();});
        document.addEventListener('mousemove',function(e){if(!drag)return;sl.value=Math.min(d.max,Math.max(d.min,sv+(sy-e.clientY)*((d.max-d.min)/100)));upd();});
        document.addEventListener('mouseup',function(){drag=false;});
    });
}

function toggleSection(id){ document.getElementById(id).classList.toggle('collapsed'); }

function getSettings() {
    return {
        threshold:     parseFloat(document.getElementById('sliderThreshold').value),
        minSilence:    parseFloat(document.getElementById('sliderMinSilence').value),
        paddingBefore: parseFloat(document.getElementById('sliderPadBefore').value),
        paddingAfter:  parseFloat(document.getElementById('sliderPadAfter').value),
        createBackup:  document.getElementById('toggleBackup').checked,
        rippleDelete:  document.getElementById('toggleRipple').checked
    };
}

function buildScript(fnName) {
    var arg = JSON.stringify(JSON.stringify(getSettings()));
    return fnName+'('+arg+')';
}

function previewSilences() {
    if (isProcessing) return;
    if (!cs) { demoPreview(); return; }
    
    setStatus('running'); startTimer(); setScan(true); setBtns(true);
    updateBanner('Ses klibi dışa aktarılıyor...');
    
    cs.evalScript("previewSilences('" + JSON.stringify(getSettings()) + "')", function(raw) {
        var r = safeJSON(raw, 'previewSilences');
        if (!r) {
            stopTimer(); setScan(false); setBtns(false);
            setStatus('error');
            return;
        }
        
        (r.log || []).forEach(function(l) { log(l); });
        
        if (!r.success) {
            stopTimer(); setScan(false); setBtns(false);
            setStatus('error');
            log('Hata: ' + (r.error || '?'), 'error');
            updateBanner('Hata: ' + (r.error || 'Dışa aktarma başarısız oldu.'));
            return;
        }
        
        updateBanner('Ses dalgası analiz ediliyor...');
        
        setTimeout(function() {
            try {
                var settings = getSettings();
                var analysis = analyzeWavFile(r.exportedPath, settings.threshold, settings.minSilence);
                var relativeRegions = analysis.regions;
                
                log('Klip Ses Düzeyi Analizi:');
                log('  · Peak (En yüksek): ' + analysis.maxDb.toFixed(1) + ' dB');
                log('  · Average (Ortalama): ' + analysis.avgDb.toFixed(1) + ' dB');
                log('  · Noise Floor (Gürültü Tabanı): ' + analysis.noiseFloor.toFixed(1) + ' dB');
                log('İpucu: Sessiz kısımları algılamak için "Eşik (Threshold)" ayarını gürültü tabanının (' + analysis.noiseFloor.toFixed(1) + ' dB) üzerinde, ortalamanın (' + analysis.avgDb.toFixed(1) + ' dB) altında tutun (Örn: ' + (analysis.noiseFloor + 3).toFixed(0) + ' dB).');
                
                try {
                    if (fsNode && fsNode.existsSync(r.exportedPath)) {
                        fsNode.unlinkSync(r.exportedPath);
                        log('✓ Geçici ses dosyası temizlendi.');
                    }
                } catch(err) {
                    console.error("Temp file deletion failed", err);
                }
                
                var clipStart = parseFloat(r.clipStart);
                var absoluteRegions = [];
                var padB = settings.paddingBefore;
                var padA = settings.paddingAfter;
                
                for (var i = 0; i < relativeRegions.length; i++) {
                    var relStart = relativeRegions[i].start;
                    var relEnd = relativeRegions[i].end;
                    
                    var cutStart = Math.max(0, relStart + padA);
                    var cutEnd = Math.min(parseFloat(r.clipEnd) - clipStart, relEnd - padB);
                    
                    if (cutEnd - cutStart < 0.02) continue;
                    
                    var timelineStart = clipStart + cutStart;
                    var timelineEnd = clipStart + cutEnd;
                    
                    absoluteRegions.push({
                        start: timelineStart.toFixed(3),
                        end: timelineEnd.toFixed(3),
                        duration: (timelineEnd - timelineStart).toFixed(3)
                    });
                }
                
                previewRegions = absoluteRegions;
                targetTrackIndex = (r.trackIndex !== undefined) ? parseInt(r.trackIndex) : 0;
                
                var visualizationRegions = [];
                for (var j = 0; j < absoluteRegions.length; j++) {
                    visualizationRegions.push({
                        start: parseFloat(absoluteRegions[j].start) - clipStart,
                        end: parseFloat(absoluteRegions[j].end) - clipStart,
                        duration: absoluteRegions[j].duration
                    });
                }
                drawRegions(visualizationRegions);
                updateStats(absoluteRegions);
                
                cs.evalScript("createPreviewMarkers('" + JSON.stringify(absoluteRegions) + "')", function() {
                    stopTimer(); setScan(false); setBtns(false);
                    setStatus('done');
                    log('Önizleme: ' + absoluteRegions.length + ' sessiz bölge bulundu.', 'success');
                    updateBanner('<span>' + absoluteRegions.length + ' sessiz bölge</span> bulundu. Kaldırmak için "Uygula"ya tıklayın.');
                });
                
            } catch(e) {
                stopTimer(); setScan(false); setBtns(false);
                setStatus('error');
                log('Analiz hatası: ' + e.message, 'error');
                updateBanner('Analiz hatası oluştu.');
            }
        }, 100);
    });
}

function applySilenceRemoval() {
    if (isProcessing) return;
    if (!cs) { demoApply(); return; }
    setStatus('running'); startTimer(); setProgress(5); setBtns(true);
    var prog = 5, iv = setInterval(function() { prog = Math.min(prog + Math.random() * 8 + 2, 90); setProgress(prog); }, 350);
    
    var args = JSON.stringify(JSON.stringify({
        settings: getSettings(),
        regions: previewRegions,
        trackIndex: targetTrackIndex
    }));
    
    cs.evalScript("removeSilences(" + args + ")", function(raw) {
        clearInterval(iv); setProgress(100); stopTimer(); setBtns(false);
        setTimeout(function() { setProgress(0); document.getElementById('progressWrap').classList.remove('visible'); }, 1500);
        var r = safeJSON(raw, 'removeSilences');
        if (!r) { setStatus('error'); return; }
        if (r.success) {
            setStatus('done');
            log('══ Tamamlandı ══', 'success');
            if (r.backupName) log('✓ Yedek: ' + r.backupName, 'success');
            log('✓ Kaldırılan: ' + r.removed + ' bölge', 'success');
            (r.log || []).forEach(function(l) { log(l); });
            drawDone();
            updateBanner('<span>Tamamlandı!</span> ' + r.removed + ' bölge kaldırıldı.' + (r.backupName ? ' Yedek: ' + r.backupName : ''));
        } else {
            setStatus('error');
            log('Hata: ' + (r.error || '?'), 'error');
            (r.log || []).forEach(function(l) { log(l, 'warn'); });
        }
    });
}

function clearPreviewMarkers() {
    if (!cs) { drawPlaceholder(); log('Demo: temizlendi.','info'); return; }
    cs.evalScript('clearPreviewMarkers()', function() {
        drawPlaceholder(); previewRegions=[]; resetStats();
        log('İşaretler temizlendi.','info'); setStatus('idle');
        updateBanner('<span>Hazır.</span> Klip seçip "Önizle"ye tıklayın.');
    });
}

// Canvas
function getC(){ var c=document.getElementById('waveformCanvas'); c.width=c.offsetWidth||360; c.height=72; return c; }
function drawPlaceholder(){
    var c=getC(),ctx=c.getContext('2d');
    ctx.fillStyle='#1e2025'; ctx.fillRect(0,0,c.width,c.height);
    ctx.strokeStyle='#2a2d35'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(0,c.height/2); ctx.lineTo(c.width,c.height/2); ctx.stroke();
    var bw=2,bc=80,gap=(c.width-bc*bw)/(bc+1);
    for(var i=0;i<bc;i++){var x=gap+i*(bw+gap),h=(Math.sin(i*0.4)*0.3+0.25)*c.height*0.7;ctx.fillStyle='#2e3240';ctx.fillRect(x,(c.height-h)/2,bw,h);}
    ctx.fillStyle='#50546080';ctx.font='10px monospace';ctx.textAlign='center';ctx.fillText('Klip seçin → Önizle',c.width/2,c.height/2+4);
}
function drawRegions(regions){
    var c=getC(),ctx=c.getContext('2d');
    ctx.fillStyle='#1e2025'; ctx.fillRect(0,0,c.width,c.height);
    var td=regions.length>0?Math.max(parseFloat(regions[regions.length-1].end)*1.1,30):60;
    var bc=120,bw=Math.max(1,Math.floor(c.width/bc)-1);
    for(var i=0;i<bc;i++){
        var t=(i/bc)*td,sil=false;
        for(var j=0;j<regions.length;j++){if(t>=parseFloat(regions[j].start)&&t<=parseFloat(regions[j].end)){sil=true;break;}}
        var h=sil?(Math.random()*3+1):(Math.sin(i*0.7)*10+Math.random()*20+10);
        ctx.fillStyle=sil?'rgba(255,77,106,0.5)':'rgba(0,212,255,0.7)';
        ctx.fillRect((i/bc)*c.width,(c.height-h)/2,bw,h);
    }
    for(var j2=0;j2<regions.length;j2++){
        var x1=(parseFloat(regions[j2].start)/td)*c.width,x2=(parseFloat(regions[j2].end)/td)*c.width;
        ctx.fillStyle='rgba(255,77,106,0.10)';ctx.fillRect(x1,0,x2-x1,c.height);
        ctx.strokeStyle='rgba(255,77,106,0.5)';ctx.lineWidth=1;ctx.strokeRect(x1,0,x2-x1,c.height);
    }
}
function drawDone(){
    var c=getC(),ctx=c.getContext('2d');
    ctx.fillStyle='#1e2025';ctx.fillRect(0,0,c.width,c.height);
    var bw=2,bc=80,gap=(c.width-bc*bw)/(bc+1);
    for(var i=0;i<bc;i++){var x=gap+i*(bw+gap),h=(Math.sin(i*0.5)*0.25+Math.random()*0.35+0.2)*c.height*0.75;ctx.fillStyle='rgba(57,211,83,0.65)';ctx.fillRect(x,(c.height-h)/2,bw,h);}
    ctx.fillStyle='#39d35380';ctx.font='10px monospace';ctx.textAlign='center';ctx.fillText('✓ Sessizlikler kaldırıldı',c.width/2,c.height*0.82);
}

function updateStats(r){
    if(!r||!r.length){resetStats();return;}
    var tot=r.reduce(function(a,x){return a+parseFloat(x.duration);},0);
    document.getElementById('statTotal').textContent=r.length+' bölge';
    document.getElementById('statSilent').textContent=tot.toFixed(1)+'s';
    document.getElementById('statSpeech').textContent='~'+(100-Math.min(80,Math.round(tot*2)))+'%';
}
function resetStats(){ ['statTotal','statSilent','statSpeech'].forEach(function(id){document.getElementById(id).textContent='—';}); }

function setBtns(d){ isProcessing=d; ['btnApply','btnPreview','btnClearMarkers'].forEach(function(id){document.getElementById(id).disabled=d;}); }
function setProgress(p){ var w=document.getElementById('progressWrap'),f=document.getElementById('progressFill'); p>0?(w.classList.add('visible'),f.style.width=p+'%'):(w.classList.remove('visible'),f.style.width='0%'); }
function setScan(a){ document.getElementById('scanBar').className='scanning-bar '+(a?'active':''); }
function setStatus(t){ var pl=document.getElementById('statusPill'),L={idle:'BEKLİYOR',running:'ÇALIŞIYOR',done:'TAMAM',error:'HATA'}; pl.className='status-pill '+t; pl.textContent=L[t]||t; }
function startTimer(){ startTime=Date.now(); timerInterval=setInterval(function(){ document.getElementById('timeDisplay').textContent=((Date.now()-startTime)/1000).toFixed(1)+'s'; },100); }
function stopTimer(){ clearInterval(timerInterval); document.getElementById('timeDisplay').textContent=((Date.now()-startTime)/1000).toFixed(2)+'s'; }
function updateBanner(html){ document.getElementById('infoBanner').innerHTML=html; }
function log(msg,type){ var o=document.getElementById('logOutput'),d=document.createElement('div'); d.className='log-line '+(type||''); d.textContent=msg; o.appendChild(d); o.scrollTop=o.scrollHeight; }
function clearLog(){ document.getElementById('logOutput').innerHTML=''; }
function copyLog(){
    var lines = document.getElementById('logOutput').querySelectorAll('.log-line');
    var txt = [];
    for(var i=0;i<lines.length;i++) txt.push(lines[i].textContent);
    var full = txt.join('\n');
    
    var copied = false;
    
    // Try Node.js clip command fallback first on Windows if available
    try {
        if (typeof window !== 'undefined' && window.require) {
            var exec = window.require('child_process').exec;
            var proc = exec('clip');
            proc.stdin.write(full);
            proc.stdin.end();
            copied = true;
        }
    } catch(err){}
    
    // Try HTML5 / Textarea fallback
    if (!copied) {
        try {
            var ta = document.createElement('textarea');
            ta.value = full;
            ta.style.position = 'absolute';
            ta.style.left = '-9999px';
            ta.style.top = '0';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            copied = document.execCommand('copy');
            document.body.removeChild(ta);
        } catch(e){}
    }
    
    var btn = document.getElementById('btnCopyLog');
    if (copied) {
        btn.textContent = 'Kopyalandı ✓';
    } else {
        btn.textContent = 'Hata ✗';
    }
    setTimeout(function(){ btn.textContent = 'Kopyala'; }, 2000);
}

function demoPreview(){
    setStatus('running');startTimer();setScan(true);setBtns(true);
    var fake=[{start:'3.20',end:'4.85',duration:'1.65'},{start:'8.10',end:'9.40',duration:'1.30'},{start:'14.50',end:'16.20',duration:'1.70'}];
    setTimeout(function(){stopTimer();setScan(false);setBtns(false);previewRegions=fake;drawRegions(fake);updateStats(fake);setStatus('done');log('Demo: 3 bölge.','success');updateBanner('<span>Demo:</span> 3 bölge.');},2000);
}
function demoApply(){
    setStatus('running');startTimer();setProgress(5);setBtns(true);
    var p=5,iv=setInterval(function(){p=Math.min(p+10,95);setProgress(p);},250);
    setTimeout(function(){clearInterval(iv);setProgress(100);stopTimer();setBtns(false);setTimeout(function(){setProgress(0);},1200);setStatus('done');log('Demo tamamlandı.','success');drawDone();},2500);
}

function formatTime(s){ var m=Math.floor(s/60),sec=Math.floor(s%60); return m+':'+(sec<10?'0':'')+sec; }
function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function toggleAboutModal(show) {
    var modal = document.getElementById('aboutModal');
    if (!modal) return;
    if (show) {
        modal.classList.add('visible');
    } else {
        modal.classList.remove('visible');
    }
}

function openExternalUrl(url) {
    if (cs && typeof cs.openURLInDefaultBrowser === 'function') {
        cs.openURLInDefaultBrowser(url);
    } else if (typeof window !== 'undefined' && window.require) {
        try {
            var exec = window.require('child_process').exec;
            exec('start "" "' + url + '"');
        } catch(e) {
            window.open(url, '_blank');
        }
    } else {
        window.open(url, '_blank');
    }
}

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' || e.keyCode === 27) {
        toggleAboutModal(false);
    }
});
