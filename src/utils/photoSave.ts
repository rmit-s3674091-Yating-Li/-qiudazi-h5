export type PhotoSaveMode = "share" | "download" | "open";
export type PhotoSaveResult = PhotoSaveMode | "cancelled";

export function choosePhotoSaveMode(canShareFiles:boolean, canDownload:boolean):PhotoSaveMode{
  if(canShareFiles)return "share";
  if(canDownload)return "download";
  return "open";
}

export function safePhotoFilename(input:string):string{
  const base=input
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g,"-")
    .replace(/\s+/g," ")
    .trim()
    .replace(/[. ]+$/g,"")
    .slice(0,80);
  const name=base||"qiudazi-photo";
  return /\.[a-z0-9]{2,5}$/i.test(name)?name:`${name}.jpg`;
}

function canAnchorDownload():boolean{
  if(typeof document==="undefined")return false;
  const a=document.createElement("a");
  return "download" in a;
}

function openSignedPhoto(url:string):PhotoSaveMode{
  if(typeof window!=="undefined")window.open(url,"_blank","noopener,noreferrer");
  return "open";
}

export async function savePhotoToDevice(url:string,filename:string):Promise<PhotoSaveResult>{
  const safeName=safePhotoFilename(filename);
  let blob:Blob;
  try{
    const response=await fetch(url,{cache:"no-store"});
    if(!response.ok)throw new Error(`PHOTO_DOWNLOAD_FAILED_${response.status}`);
    blob=await response.blob();
  }catch{
    return openSignedPhoto(url);
  }

  const file=new File([blob],safeName,{type:blob.type||"image/jpeg"});
  const shareCapable=typeof navigator!=="undefined"&&typeof navigator.share==="function"&&typeof navigator.canShare==="function"&&navigator.canShare({files:[file]});
  const mode=choosePhotoSaveMode(shareCapable,canAnchorDownload());

  if(mode==="share"){
    try{
      await navigator.share({files:[file],title:safeName});
      return "share";
    }catch(error){
      if(error instanceof DOMException&&error.name==="AbortError")return "cancelled";
      // A WebView can advertise file sharing but still reject it at runtime.
      // Fall through to an ordinary download/open path instead of failing the action.
    }
  }

  if(canAnchorDownload()&&typeof URL!=="undefined"){
    const objectUrl=URL.createObjectURL(blob);
    try{
      const a=document.createElement("a");
      a.href=objectUrl;
      a.download=safeName;
      a.rel="noopener noreferrer";
      a.style.display="none";
      document.body.appendChild(a);
      a.click();
      a.remove();
      return "download";
    }finally{
      setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
    }
  }

  return openSignedPhoto(url);
}
