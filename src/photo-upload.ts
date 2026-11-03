import {MAX_PHOTO_BYTES,validatePhoto} from './photo';
export const MAX_UPLOAD_BYTES=10*1024*1024;
/** Re-encode decoded pixels, excluding original file metadata and filenames. */
export async function prepareRecipePhoto(file:File):Promise<string>{
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('请选择 JPG、PNG 或 WebP 图片。暂不支持 HEIC、GIF 和 SVG。');
 if(!file.size||file.size>MAX_UPLOAD_BYTES)throw Error('原图不能超过 10 MB，请选择较小的图片。');
 let bitmap:ImageBitmap;try{bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});}catch{throw Error('图片无法读取，请选择有效的 JPG、PNG 或 WebP 文件。');}
 try{
  if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>40_000_000)throw Error('图片像素过大，请先缩小后再上传。');
  const scale=Math.min(1,960/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const context=canvas.getContext('2d');if(!context)throw Error('当前浏览器无法处理图片，请换一个浏览器重试。');
  for(let round=0;round<5;round++){
   context.clearRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);
   for(const quality of [.82,.65,.48]){
    let blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/webp',quality));
    if(blob?.type!=='image/webp'){
     context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);
     blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
    }
    if(blob&&blob.size<=MAX_PHOTO_BYTES&&['image/webp','image/jpeg'].includes(blob.type)){
     const url=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('图片读取失败，请重试。'));reader.readAsDataURL(blob!);});
     validatePhoto(url);return url;
    }
   }
   canvas.width=Math.max(1,Math.round(canvas.width*.75));canvas.height=Math.max(1,Math.round(canvas.height*.75));
  }
  throw Error('图片压缩后仍过大，请先裁剪或缩小图片。');
 }finally{bitmap.close();}
}
