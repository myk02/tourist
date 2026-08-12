export type Stop = { day:number; time:string; title:string; place:string; cost:number; kind:string; lat?:number; lng?:number; reason?:string; locked?:boolean; verified?:boolean; duration?:number }
export type Generated = { name:string; destination:string; summary:string; stops:Stop[] }
