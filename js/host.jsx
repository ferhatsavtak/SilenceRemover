// Silence Remover Pro — host.jsx v5
// ExtendScript ES3

function _j(obj) {
    var t = typeof obj;
    if (obj === null || obj === undefined) return 'null';
    if (t === 'boolean') return obj ? 'true' : 'false';
    if (t === 'number')  return isFinite(obj) ? String(obj) : 'null';
    if (t === 'string')  return '"' + obj.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,'\\n').replace(/\r/g,'\\r') + '"';
    if (obj instanceof Array) { var a=[]; for(var i=0;i<obj.length;i++) a.push(_j(obj[i])); return '['+a.join(',')+']'; }
    var p=[]; for(var k in obj){ if(obj.hasOwnProperty(k)) p.push(_j(k)+':'+_j(obj[k])); } return '{'+p.join(',')+'}';
}
function _parse(s) { try { return eval('('+s+')') || {}; } catch(e) { return {}; } }

function srTest() { return 'OK'; }
function srTestApp() {
    try {
        if (typeof app==='undefined') return 'no_app';
        var seq = app.project.activeSequence;
        return seq ? 'seq:'+seq.name : 'no_sequence';
    } catch(e) { return 'err:'+String(e); }
}

function getSequenceInfo() {
    var r={success:false,name:'',clipCount:0,duration:0,error:''};
    try {
        var seq=app.project.activeSequence;
        if (!seq) { r.error='Aktif sekans yok'; return _j(r); }
        r.success=true; r.name=String(seq.name||'Sekans');
        try { r.duration=Number(seq.end.seconds)||0; } catch(e){}
        var n=0;
        try { for(var t=0;t<seq.audioTracks.numTracks;t++) n+=seq.audioTracks[t].clips.numItems; } catch(e){}
        r.clipCount=n;
    } catch(e) { r.error=String(e); }
    return _j(r);
}

function _getSelectedClipRange() {
    var seq=app.project.activeSequence;
    if (!seq) return null;
    // Audio track'lerde seçili klip
    for (var at=0;at<seq.audioTracks.numTracks;at++) {
        var atr=seq.audioTracks[at];
        for (var ac=0;ac<atr.clips.numItems;ac++) {
            try { var cl=atr.clips[ac]; if(cl.isSelected()) return {start:Number(cl.start.seconds),end:Number(cl.end.seconds),name:String(cl.name||'ses'),type:'audio',trackIndex:at}; } catch(e){}
        }
    }
    // Video track'lerde seçili klip
    for (var vt=0;vt<seq.videoTracks.numTracks;vt++) {
        var vtr=seq.videoTracks[vt];
        for (var vc=0;vc<vtr.clips.numItems;vc++) {
            try { var vcl=vtr.clips[vc]; if(vcl.isSelected()) return {start:Number(vcl.start.seconds),end:Number(vcl.end.seconds),name:String(vcl.name||'video'),type:'video',trackIndex:vt}; } catch(e){}
        }
    }
    return null;
}

function findBinByName(parentItem, name) {
    if (!parentItem || !parentItem.children) return null;
    for (var i = 0; i < parentItem.children.numItems; i++) {
        var item = parentItem.children[i];
        if (!item) continue;
        var hasChildren = false;
        try {
            hasChildren = (item.children && item.children.numItems !== undefined);
        } catch(e){}
        if (hasChildren && String(item.name) === name) {
            return item;
        }
        if (hasChildren) {
            var found = findBinByName(item, name);
            if (found) return found;
        }
    }
    return null;
}

function findProjectItemByName(parentItem, name) {
    if (!parentItem || !parentItem.children) return null;
    for (var i = 0; i < parentItem.children.numItems; i++) {
        var item = parentItem.children[i];
        if (!item) continue;
        if (String(item.name) === name) {
            return item;
        }
        var hasChildren = false;
        try {
            hasChildren = (item.children && item.children.numItems !== undefined);
        } catch(e){}
        if (hasChildren) {
            var found = findProjectItemByName(item, name);
            if (found) return found;
        }
    }
    return null;
}

function _findWavPreset(folder, depth) {
    if (depth > 5) return null;
    try {
        var files = folder.getFiles();
        for (var i = 0; i < files.length; i++) {
            var f = files[i];
            if (f instanceof Folder) {
                var res = _findWavPreset(f, depth + 1);
                if (res) return res;
            } else if (f instanceof File && f.name.slice(-4).toLowerCase() === '.epr') {
                var pName = String(f.parent.name).toLowerCase();
                var fName = String(f.name).toLowerCase();
                if (pName.indexOf('5741565f') !== -1 || fName.indexOf('wav') !== -1 || fName.indexOf('wave') !== -1) {
                    return f.fsName;
                }
            }
        }
    } catch(e){}
    return null;
}

function getWavPresetPath() {
    try {
        var startup = new Folder(Folder.startup.fsName);
        var presets = new Folder(startup.fsName + "/MediaIO/systempresets");
        if (presets.exists) {
            var path = _findWavPreset(presets, 1);
            if (path) return path;
        }
    } catch(e){}
    
    try {
        var docFolder = new Folder(Folder.myDocuments.fsName + "/Adobe/Adobe Media Encoder");
        if (docFolder.exists) {
            var path2 = _findWavPreset(docFolder, 1);
            if (path2) return path2;
        }
    } catch(e){}
    
    try {
        var common = new Folder(Folder.userData.fsName + "/Adobe/Common/AME");
        if (common.exists) {
            var path3 = _findWavPreset(common, 1);
            if (path3) return path3;
        }
    } catch(e){}
    
    return "";
}

function setTrackMuted(track, state) {
    try {
        track.mute = state ? 1 : 0;
    } catch(e) {
        try {
            track.mute = state;
        } catch(e2) {
            try {
                track.setMute(state ? 1 : 0);
            } catch(e3){}
        }
    }
}

function previewSilences(settingsArg) {
    var r = {success: false, log: []};
    try {
        var seq = app.project.activeSequence;
        if (!seq) { r.error = 'Aktif sekans yok'; return _j(r); }

        var sel = _getSelectedClipRange();
        if (!sel) {
            r.error = 'Lütfen timeline üzerinde kesmek istediğiniz ses klibini seçin.';
            return _j(r);
        }

        r.log.push('Seçili klip: ' + sel.name + ' (' + sel.start.toFixed(2) + 's – ' + sel.end.toFixed(2) + 's)');

        var presetPath = getWavPresetPath();
        if (!presetPath) {
            r.error = 'Varsayılan WAV dışa aktarım şablonu (.epr) bulunamadı.';
            return _j(r);
        }
        r.log.push('Kullanılan preset: ' + presetPath);

        // Temp path
        var tempFolder = Folder.temp.fsName;
        var tempWavPath = tempFolder + '\\srp_temp_audio.wav';
        tempWavPath = tempWavPath.replace(/\//g, '\\');
        r.log.push('Dışa aktarma konumu: ' + tempWavPath);

        // Delete existing temp file if any
        try {
            var oldFile = new File(tempWavPath);
            if (oldFile.exists) oldFile.remove();
        } catch(e){}

        // Save original in/out points
        var origIn = seq.getInPoint();
        var origOut = seq.getOutPoint();

        // Save track states: solo/mute
        var trackStates = [];
        for (var t = 0; t < seq.audioTracks.numTracks; t++) {
            var track = seq.audioTracks[t];
            var isMuted = false;
            try { isMuted = (track.mute === 1 || track.mute === true); } catch(e){}
            try { if (!isMuted) isMuted = track.isMuted(); } catch(e){}
            trackStates.push({
                muted: isMuted
            });
        }

        // Solo the target track: mute all others
        var targetTrackIdx = sel.trackIndex;
        for (var t = 0; t < seq.audioTracks.numTracks; t++) {
            var track = seq.audioTracks[t];
            if (t === targetTrackIdx) {
                setTrackMuted(track, false);
            } else {
                setTrackMuted(track, true);
            }
        }

        // Set In/Out to selected clip boundaries
        seq.setInPoint(sel.start);
        seq.setOutPoint(sel.end);

        // Export
        // 1 represents ENCODE_IN_TO_OUT
        var result = seq.exportAsMediaDirect(tempWavPath, presetPath, 1);

        // Restore original track states
        for (var t = 0; t < seq.audioTracks.numTracks; t++) {
            var track = seq.audioTracks[t];
            if (trackStates[t]) {
                setTrackMuted(track, trackStates[t].muted);
            }
        }

        // Restore original in/out points
        seq.setInPoint(origIn);
        seq.setOutPoint(origOut);

        if (result === 0 || result === 'No Error') {
            r.success = true;
            r.exportedPath = tempWavPath;
            r.clipStart = sel.start;
            r.clipEnd = sel.end;
            r.clipName = sel.name;
            r.trackIndex = sel.trackIndex;
        } else {
            r.error = 'Dışa aktarma başarısız oldu (Hata Kodu: ' + result + ')';
        }
    } catch(e) {
        r.error = String(e);
        r.log.push('HATA: ' + String(e));
    }
    return _j(r);
}

function createPreviewMarkers(regionsJson) {
    var r = {success: false};
    try {
        var seq = app.project.activeSequence;
        if (!seq) return _j(r);
        
        // Clear old markers
        try {
            var mkrs = seq.markers;
            for (var m = mkrs.numMarkers - 1; m >= 0; m--) {
                var mk = mkrs[m];
                if (String(mk.comments) === 'SRP') mkrs.deleteMarker(mk);
            }
        } catch(e){}
        
        var regions = _parse(regionsJson);
        for (var i = 0; i < regions.length; i++) {
            try {
                var nm = seq.markers.createMarker(Number(regions[i].start));
                nm.end = Number(regions[i].end);
                nm.name = 'Sessizlik ' + (i + 1);
                nm.comments = 'SRP';
                nm.colorByIndex = 1;
            } catch(e){}
        }
        r.success = true;
    } catch(e){}
    return _j(r);
}

function secondsToTimecode(sec, fps) {
    if (isNaN(sec) || sec < 0) sec = 0;
    var hrs = Math.floor(sec / 3600);
    var mins = Math.floor((sec % 3600) / 60);
    var secs = Math.floor(sec % 60);
    var frames = Math.round((sec % 1) * fps);
    var intFps = Math.round(fps);
    if (frames >= intFps) {
        frames -= intFps;
        secs += 1;
        if (secs >= 60) {
            secs -= 60;
            mins += 1;
            if (mins >= 60) {
                mins -= 60;
                hrs += 1;
            }
        }
    }
    var pad = function(num) { return (num < 10 ? '0' : '') + num; };
    return pad(hrs) + ':' + pad(mins) + ':' + pad(secs) + ':' + pad(frames);
}

function removeSilences(argsStr) {
    var r = {success: false, removed: 0, log: []};
    try {
        var args = _parse(argsStr);
        var s = args.settings || {};
        var regions = args.regions || [];
        var doBk = (s.createBackup !== false);
        
        var seq = app.project.activeSequence;
        if (!seq) { r.error = 'Aktif sekans yok'; return _j(r); }
        
        if (!regions.length) {
            r.success = true;
            r.log.push('Kaldırılacak sessizlik yok.');
            return _j(r);
        }
        
        var targetTrackIdx = 0;
        if (args.trackIndex !== undefined) {
            targetTrackIdx = Number(args.trackIndex);
        } else {
            var sel = _getSelectedClipRange();
            if (sel && sel.type === 'audio') {
                targetTrackIdx = sel.trackIndex;
            }
        }
        if (isNaN(targetTrackIdx)) targetTrackIdx = 0;
        
        r.log.push('Hedef ses kanalı: A' + (targetTrackIdx + 1));
        
        // Create backup
        if (doBk) {
            try {
                var d = new Date();
                var origName = String(seq.name);
                var bn = origName + '_BACKUP_' + d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2) + '_' + ('0' + d.getHours()).slice(-2) + ('0' + d.getMinutes()).slice(-2);
                var binName = 'Yedek Sekanslar';
                var root = app.project.rootItem;
                
                var backupBin = findBinByName(root, binName);
                if (!backupBin) {
                    backupBin = root.createBin(binName);
                }
                
                // Clear preview markers on original sequence before cloning so the backup is clean
                try {
                    var oldMkrs = seq.markers;
                    for (var m = oldMkrs.numMarkers - 1; m >= 0; m--) {
                        var mk = oldMkrs[m];
                        if (String(mk.comments) === 'SRP') oldMkrs.deleteMarker(mk);
                    }
                } catch(e1){}
                
                // Rename original to backup name
                seq.name = bn;
                try { if (seq.projectItem) seq.projectItem.name = bn; } catch(e2){}
                
                // Clone the sequence (opens the duplicate in timeline)
                try {
                    seq.clone();
                } catch(err) {
                    // Restore original name on failure
                    seq.name = origName;
                    try { if (seq.projectItem) seq.projectItem.name = origName; } catch(e3){}
                    throw err;
                }
                
                // Find the cloned sequence. Since seq.clone() returns undefined/boolean, we search for the sequence starting with 'bn' and having a different ID.
                var dup = null;
                var allSeqs = app.project.sequences;
                for (var sIdx = 0; sIdx < allSeqs.numSequences; sIdx++) {
                    var sItem = allSeqs[sIdx];
                    if (sItem && String(sItem.name).indexOf(bn) === 0 && sItem.sequenceID !== seq.sequenceID) {
                        dup = sItem;
                        break;
                    }
                }
                
                if (dup) {
                    // Rename clone back to original name (the clone is currently active)
                    dup.name = origName;
                    try { if (dup.projectItem) dup.projectItem.name = origName; } catch(e4){}
                    
                    // Find the backup sequence project item (which is 'seq' under backup name 'bn')
                    var backupProjItem = null;
                    if (seq.projectItem) {
                        backupProjItem = seq.projectItem;
                    }
                    if (!backupProjItem) {
                        backupProjItem = findProjectItemByName(root, bn);
                    }
                    
                    if (backupProjItem) {
                        if (backupBin) {
                            backupProjItem.moveBin(backupBin);
                            r.backupName = binName + '/' + bn;
                            r.log.push('✓ Yedek oluşturuldu: ' + binName + '/' + bn);
                        } else {
                            r.backupName = bn;
                            r.log.push('✓ Yedek oluşturuldu ama klasör bulunamadı: ' + bn);
                        }
                    } else {
                        r.backupName = bn;
                        r.log.push('✓ Yedek oluşturuldu ama projedeki ögesi bulunamadı: ' + bn);
                    }
                    
                    // Redirect seq variable to the active cloned sequence
                    seq = dup;
                } else {
                    // If we couldn't find the clone, rename the original sequence back
                    seq.name = origName;
                    try { if (seq.projectItem) seq.projectItem.name = origName; } catch(e5){}
                    r.log.push('✗ Yedek klon sekans bulunamadı.');
                }
            } catch(e) {
                r.log.push('Yedek alınamadı: ' + String(e));
            }
        }
        
        // Get Sequence Frame Rate (FPS)
        var fps = 25;
        try {
            var settings = seq.getSettings();
            if (settings && settings.videoFrameRate) {
                var secPerFrame = Number(settings.videoFrameRate.seconds);
                if (secPerFrame > 0) {
                    fps = 1.0 / secPerFrame;
                }
            }
        } catch(e1){}
        r.log.push('Sekans kare hızı (FPS): ' + fps.toFixed(2));
        
        // Sort regions from right to left (descending order of start times)
        regions.sort(function(a, b) { return Number(b.start) - Number(a.start); });
        
        // Enable QE DOM
        app.enableQE();
        var qeSeq = qe.project.getActiveSequence();
        
        var removed = 0;
        for (var i = 0; i < regions.length; i++) {
            var cutS = Number(regions[i].start);
            var cutE = Number(regions[i].end);
            
            var ok = false;
            
            // 1. Split utilizing QE DOM on ALL tracks individually
            try {
                if (qeSeq) {
                    var tcS = secondsToTimecode(cutS, fps);
                    var tcE = secondsToTimecode(cutE, fps);
                    
                    // Razor all video tracks
                    var numVideo = qeSeq.numVideoTracks;
                    if (typeof numVideo === 'number') {
                        for (var vt = 0; vt < numVideo; vt++) {
                            try {
                                var qeVTrack = qeSeq.getVideoTrackAt(vt);
                                if (qeVTrack) {
                                    try { qeVTrack.razor(tcS); } catch(e){}
                                    try { qeVTrack.razor(tcE); } catch(e){}
                                }
                            } catch(e){}
                        }
                    }
                    
                    // Razor all audio tracks
                    var numAudio = qeSeq.numAudioTracks;
                    if (typeof numAudio === 'number') {
                        for (var at = 0; at < numAudio; at++) {
                            try {
                                var qeATrack = qeSeq.getAudioTrackAt(at);
                                if (qeATrack) {
                                    try { qeATrack.razor(tcS); } catch(e){}
                                    try { qeATrack.razor(tcE); } catch(e){}
                                }
                            } catch(e){}
                        }
                    }
                }
            } catch(e){}
            
            // 2. Find split clips on all tracks, lift all except one, and ripple-delete that one
            try {
                var clipsToRemove = [];
                
                // Video tracks
                for (var t = 0; t < seq.videoTracks.numTracks; t++) {
                    var track = seq.videoTracks[t];
                    if (track && track.clips) {
                        for (var c = 0; c < track.clips.numItems; c++) {
                            var clip = track.clips[c];
                            if (!clip) continue;
                            var cs = Number(clip.start.seconds);
                            var ce = Number(clip.end.seconds);
                            if (cs >= cutS - 0.15 && ce <= cutE + 0.15) {
                                clipsToRemove.push({ clip: clip, isTargetTrack: false });
                            }
                        }
                    }
                }
                
                // Audio tracks
                for (var t = 0; t < seq.audioTracks.numTracks; t++) {
                    var track = seq.audioTracks[t];
                    if (track && track.clips) {
                        for (var c = 0; c < track.clips.numItems; c++) {
                            var clip = track.clips[c];
                            if (!clip) continue;
                            var cs = Number(clip.start.seconds);
                            var ce = Number(clip.end.seconds);
                            if (cs >= cutS - 0.15 && ce <= cutE + 0.15) {
                                clipsToRemove.push({ clip: clip, isTargetTrack: (t === targetTrackIdx) });
                            }
                        }
                    }
                }
                
                if (clipsToRemove.length > 0) {
                    // Choose one clip to be the ripple trigger.
                    // Prefer a clip on the target audio track if available, otherwise any clip.
                    var triggerIdx = -1;
                    for (var k = 0; k < clipsToRemove.length; k++) {
                        if (clipsToRemove[k].isTargetTrack) {
                            triggerIdx = k;
                            break;
                        }
                    }
                    if (triggerIdx === -1) {
                        triggerIdx = 0; // fallback to the first found clip
                    }
                    
                    // Remove all other clips with lift (no ripple)
                    for (var k = 0; k < clipsToRemove.length; k++) {
                        if (k !== triggerIdx) {
                            try { clipsToRemove[k].clip.remove(0, 0); } catch(e){}
                        }
                    }
                    
                    // Remove the trigger clip with ripple delete (if enabled)
                    try {
                        clipsToRemove[triggerIdx].clip.remove(s.rippleDelete ? 1 : 0, 0);
                        ok = true;
                    } catch(e){}
                }
            } catch(e3){}
            
            // Fallback manual delete
            if (!ok) {
                try {
                    var fallbackOk = _rippleDelete(seq, cutS, cutE);
                    if (fallbackOk) {
                        ok = true;
                    } else {
                        r.log.push('✗ Hata: Sessiz bölge kesilemedi veya bulunamadı (' + cutS.toFixed(2) + 's - ' + cutE.toFixed(2) + 's)');
                    }
                } catch(e2) {
                    r.log.push('✗ Hata (' + cutS.toFixed(2) + 's): ' + String(e2));
                }
            }
            
            if (ok) {
                removed++;
                r.log.push('✓ Kaldırıldı: ' + cutS.toFixed(2) + 's → ' + cutE.toFixed(2) + 's');
            }
        }
        
        r.success = true;
        r.removed = removed;
        r.log.push('══ Tamamlandı: ' + removed + '/' + regions.length + ' kaldırıldı ══');
        
        // Clear preview markers
        try {
            var mkrs = seq.markers;
            for (var m = mkrs.numMarkers - 1; m >= 0; m--) {
                var mk = mkrs[m];
                if (String(mk.comments) === 'SRP') mkrs.deleteMarker(mk);
            }
        } catch(e){}
    } catch(e) {
        r.error = String(e);
        r.log.push('HATA: ' + String(e));
    }
    return _j(r);
}

function _rippleDelete(seq, cutS, cutE) {
    var shift = cutE - cutS;
    var deletedAnyGlobal = false;
    
    if (!seq || !seq.videoTracks || !seq.audioTracks) return false;
    
    var allTracks = [];
    for (var t = 0; t < seq.videoTracks.numTracks; t++) {
        var tr = seq.videoTracks[t];
        if (tr) allTracks.push(tr);
    }
    for (var t2 = 0; t2 < seq.audioTracks.numTracks; t2++) {
        var tr2 = seq.audioTracks[t2];
        if (tr2) allTracks.push(tr2);
    }
    
    for (var i = 0; i < allTracks.length; i++) {
        var tr = allTracks[i];
        if (!tr || !tr.clips) continue;
        
        // Cache clips in standard array to prevent stale collection index errors
        var clips = [];
        for (var c = 0; c < tr.clips.numItems; c++) {
            var cl = tr.clips[c];
            if (cl) clips.push(cl);
        }
        
        var deletedAnyTrack = false;
        for (var j = clips.length - 1; j >= 0; j--) {
            var clip = clips[j];
            var cs = 0, ce = 0;
            try { cs = Number(clip.start.seconds); ce = Number(clip.end.seconds); } catch(e) { continue; }
            if (ce <= cutS || cs >= cutE) continue;
            
            // Only remove if the clip is entirely or almost entirely within the cut range
            if (cs >= cutS - 0.08 && ce <= cutE + 0.08) {
                try {
                    clip.remove(false, false);
                    deletedAnyTrack = true;
                    deletedAnyGlobal = true;
                } catch(e){}
            }
        }
        
        if (deletedAnyTrack) {
            // Re-cache updated clips
            var updatedClips = [];
            for (var c = 0; c < tr.clips.numItems; c++) {
                var cl = tr.clips[c];
                if (cl) updatedClips.push(cl);
            }
            
            for (var j = 0; j < updatedClips.length; j++) {
                var clip2 = updatedClips[j];
                var cs2 = 0;
                try { cs2 = Number(clip2.start.seconds); } catch(e) { continue; }
                if (cs2 >= cutE - 0.08) {
                    try {
                        var nt4 = new Time();
                        nt4.seconds = cs2 - shift;
                        clip2.start = nt4;
                    } catch(e){}
                }
            }
        }
    }
    return deletedAnyGlobal;
}

function clearPreviewMarkers() {
    var r = {success: false};
    try {
        var seq = app.project.activeSequence;
        if (!seq) { r.error = 'Sekans yok'; return _j(r); }
        var mkrs = seq.markers;
        for (var m = mkrs.numMarkers - 1; m >= 0; m--) {
            var mk = mkrs[m];
            if (String(mk.comments) === 'SRP') mkrs.deleteMarker(mk);
        }
        r.success = true;
    } catch(e) { r.error = String(e); }
    return _j(r);
}
