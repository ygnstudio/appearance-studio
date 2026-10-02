'use strict';
// Shared implementation defaults. These do not overwrite saved appearance values.
const TIMING=Object.freeze({draftMs:300,autoSaveMs:1500,externalCheckMs:8000});
const HISTORY=Object.freeze({perFile:10,total:50});
const LAYOUT=Object.freeze({narrowWidthPx:540,tabBorderTintPercent:65,touchTargetPx:44,codeToolbarPx:52,codeActionGapPx:8});
module.exports={TIMING,HISTORY,LAYOUT};
