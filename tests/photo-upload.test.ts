import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {prepareRecipePhoto,MAX_UPLOAD_BYTES} from '../src/photo-upload';
import {MAX_PHOTO_BYTES} from '../src/photo';
const bytes=await readFile(new URL('../public/images/recipes/matcha.webp',import.meta.url));

// Test browser-processing control flow with deterministic codec adapters. These
// tests do not claim to replace real browser/image-codec or phone verification.
async function withCodec(options:{oversize?:boolean;hugePixels?:boolean;decodeFails?:boolean},run:(state:{canvas:any;closed:boolean;calls:number;draws:number;orientation?:string})=>Promise<void>){
 const original=new Map(['createImageBitmap','document','FileReader'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const state={canvas:{width:0,height:0,getContext:()=>({clearRect(){},drawImage(){state.draws++;}}),toBlob(callback:(blob:Blob)=>void,type:string){state.calls++;callback(new Blob([options.oversize||state.calls===1?Buffer.alloc(MAX_PHOTO_BYTES+1):bytes],{type}));}},closed:false,calls:0,draws:0,orientation:undefined as string|undefined};
 Object.defineProperty(globalThis,'createImageBitmap',{configurable:true,value:async(_file:File,config:{imageOrientation:string})=>{if(options.decodeFails)throw Error('decoder failed');state.orientation=config.imageOrientation;return {width:options.hugePixels?10000:2000,height:options.hugePixels?10000:1000,close(){state.closed=true;}};}});
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>state.canvas}});
 Object.defineProperty(globalThis,'FileReader',{configurable:true,value:class {result='';onload?:()=>void;onerror?:()=>void;readAsDataURL(blob:Blob){blob.arrayBuffer().then(buffer=>{this.result=`data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`;this.onload?.();}).catch(()=>this.onerror?.());}}});
 try{await run(state);}finally{for(const [key,descriptor] of original){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}}
}
test('upload re-encodes at bounded dimensions, retries quality, and closes decoded bitmap',async()=>{
 await withCodec({},async state=>{const result=await prepareRecipePhoto(new File([bytes],'private-name.webp',{type:'image/webp'}));assert.equal(result,'data:image/webp;base64,'+bytes.toString('base64'));assert.equal(state.canvas.width,960);assert.equal(state.canvas.height,480);assert.equal(state.orientation,'from-image');assert.equal(state.calls,2);assert(state.closed);assert(!result.includes('private-name'));});
});
test('bad type and oversized source fail before decoding; unreadable images report a recoverable error',async()=>{
 await assert.rejects(prepareRecipePhoto(new File(['<svg/>'],'image.svg',{type:'image/svg+xml'})),/JPG/);
 await assert.rejects(prepareRecipePhoto(new File([Buffer.alloc(MAX_UPLOAD_BYTES+1)],'large.png',{type:'image/png'})),/10 MB/);
 await withCodec({decodeFails:true},async()=>{await assert.rejects(prepareRecipePhoto(new File([bytes],'broken.webp',{type:'image/webp'})),/无法读取/);});
});
test('huge pixels and codecs that cannot meet the size budget reject and release image resources',async()=>{
 await withCodec({hugePixels:true},async state=>{await assert.rejects(prepareRecipePhoto(new File([bytes],'large.webp',{type:'image/webp'})),/像素过大/);assert(state.closed);assert.equal(state.calls,0);});
 await withCodec({oversize:true},async state=>{await assert.rejects(prepareRecipePhoto(new File([bytes],'noisy.webp',{type:'image/webp'})),/压缩后仍过大/);assert(state.closed);assert.equal(state.calls,15);assert(state.canvas.width<960);});
});
