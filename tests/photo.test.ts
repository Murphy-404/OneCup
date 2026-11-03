import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validatePhoto,recipePhotoSource,recipePhotoCaption,assertWorkspaceFits,MAX_PHOTO_BYTES} from '../src/photo';
import {freshData,validateBackup} from '../src/logic';
import {emptyCustom,customVersion,addCollectionItem,currentSource,sourceChanged} from '../src/library';
import {recipes} from '../src/data';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {RecipePreview} from '../src/components/RecipePreview';
import {RecipeImageEditor} from '../src/components/RecipeImageEditor';
const photo='data:image/webp;base64,'+(await readFile(new URL('../public/images/recipes/matcha.webp',import.meta.url))).toString('base64');
const replacement='data:image/webp;base64,'+(await readFile(new URL('../public/images/recipes/oat-latte.webp',import.meta.url))).toString('base64');
function custom(){const c=emptyCustom();c.recipe={...structuredClone(recipes[0]),id:c.id,name:'我的照片配方',photo};c.status='ready';return c;}

test('single-image preview removes vessel choices and upload controls distinguish new, existing and read-only photos',()=>{
 const reference=renderToStaticMarkup(createElement(RecipePreview,{recipe:recipes[0]}));assert(reference.includes('/images/recipes/matcha.webp'));assert(reference.includes('放大预览'));assert(!reference.includes('预览杯型'));assert(!reference.includes('/images/vessels/'));assert(!reference.includes('切换杯型'));
 const own=renderToStaticMarkup(createElement(RecipePreview,{recipe:custom().recipe}));assert(own.includes('用户上传图片'));assert(!own.includes('AI 成品示意'));
 const props={onChange:()=>{},onBusyChange:()=>{}};assert(renderToStaticMarkup(createElement(RecipeImageEditor,props)).includes('上传图片'));
 const editor=renderToStaticMarkup(createElement(RecipeImageEditor,{...props,photo,disabled:true}));assert(editor.includes('更换图片'));assert(editor.includes('移除图片'));assert.match(editor,/<button[^>]+disabled/);
});

test('stored photos require bounded inline raster data, not remote URLs, SVG or mismatched bytes',()=>{
 validatePhoto(photo);validatePhoto(undefined);
 for(const bad of [null,'',{},'https://example.test/private.jpg','blob:temporary','data:image/svg+xml;base64,PHN2Zz4=',photo.replace('image/webp','image/jpeg'),photo.slice(0,-8),photo+'!', 'data:image/webp;base64,'+Buffer.alloc(MAX_PHOTO_BYTES+1).toString('base64')])assert.throws(()=>validatePhoto(bad));
});
test('photo survives drafts, ready recipes, versions, plan, collection export and JSON restore',()=>{
 const c=custom(),version=customVersion(c),collection=addCollectionItem({id:'photos',name:'我的饮品',description:'',items:[],updatedAt:c.updatedAt},'custom',c.id,version);
 const data={...freshData(),customRecipes:[c],versions:[version],plan:[{...version,id:'photo-plan'}],collections:[collection]};
 assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(data))),data);
 const restored=validateBackup({...freshData(),collections:[collection]});assert.equal(restored.collections[0].items[0].snapshot.snapshot.photo,photo);
 const draft=structuredClone(c);draft.status='draft';draft.recipe.name='';assert.equal(validateBackup({...freshData(),customRecipes:[draft]}).customRecipes[0].recipe.photo,photo);
});
test('replacing or removing a source photo does not rewrite frozen collection and saved-version photos',()=>{
 const c=custom(),version=customVersion(c),data={...freshData(),customRecipes:[c]};
 c.recipe.photo=replacement;assert(sourceChanged(version,currentSource(data,'custom',c.id)!));assert.equal(version.snapshot.photo,photo);
 delete c.recipe.photo;assert.equal(recipePhotoSource(customVersion(c).snapshot),undefined);assert.equal(version.snapshot.photo,photo);
 assert.equal(recipePhotoCaption(version.snapshot),'用户上传图片');assert.equal(recipePhotoCaption(c.recipe),'私人配方 · 暂无图片');assert.equal(recipePhotoSource(recipes[0]),'/images/recipes/matcha.webp');
});
test('invalid photos are rejected from drafts and every snapshot path without mutating source records',()=>{
 const c=custom(),version=customVersion(c);const bad=structuredClone(c);bad.recipe.photo='https://example.test/remote.png';bad.status='draft';assert.throws(()=>validateBackup({...freshData(),customRecipes:[bad]}));
 for(const key of ['versions','plan'] as const)assert.throws(()=>validateBackup({...freshData(),[key]:[{...version,snapshot:{...version.snapshot,photo:'data:image/svg+xml;base64,PHN2Zz4='}}]}));
 const collection=addCollectionItem({id:'c',name:'图片',description:'',items:[],updatedAt:c.updatedAt},'custom',c.id,version);collection.items[0].snapshot.snapshot.photo='blob:expired';assert.throws(()=>validateBackup({...freshData(),collections:[collection]}));assert.equal(c.recipe.photo,photo);
});
test('workspace limits use UTF-8 bytes including images and request envelope, before committing a save',()=>{
 const data={...freshData(),customRecipes:[custom()]},before=JSON.stringify(data);const size=new TextEncoder().encode(JSON.stringify({data,revision:Number.MAX_SAFE_INTEGER})).byteLength;
 assertWorkspaceFits(data,size);assert.throws(()=>assertWorkspaceFits(data,size-1),/当前输入已保留/);assert.equal(JSON.stringify(data),before);
 const unicode={note:'奶'.repeat(100)};assert.throws(()=>assertWorkspaceFits(unicode,JSON.stringify({data:unicode}).length+50));
});
