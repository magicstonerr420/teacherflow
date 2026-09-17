import {useEffect,useState} from 'react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {downloadBlob} from '@/lib/pptx';
export function PdfPreview({file,onClose}:{file:{blob:Blob;name:string}|null;onClose:()=>void}){
  const [url,setUrl]=useState('');
  useEffect(()=>{if(!file){setUrl('');return;}const next=URL.createObjectURL(file.blob);setUrl(next);return()=>URL.revokeObjectURL(next);},[file]);
  return <Dialog open={!!file} onOpenChange={open=>{if(!open)onClose();}}>
    <DialogContent className="h-[92vh] w-[95vw] max-w-none sm:max-w-6xl flex flex-col">
      <DialogHeader><DialogTitle>PDF preview</DialogTitle><DialogDescription>Review the actual pages below. Use the PDF viewer’s print button or download the file. This PDF contains no browser date, website address or navigation.</DialogDescription></DialogHeader>
      <div><Button onClick={()=>file&&downloadBlob(file.blob,file.name)}>Download PDF</Button></div>
      {url?<iframe title="PDF preview" src={`${url}#toolbar=1`} className="min-h-0 w-full flex-1 rounded border bg-white"/>:null}
    </DialogContent>
  </Dialog>;
}
