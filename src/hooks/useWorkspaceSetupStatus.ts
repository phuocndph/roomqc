import {useCallback,useEffect,useRef,useState} from 'react'
import {supabase} from '@/integrations/supabase/client'
import {runtimeConfig} from '@/lib/runtime-config'
import {ControlHttpError} from '@/lib/control-http-error'
import {loadWorkspaceSetupStatus,type WorkspaceSetupStatus} from '@/lib/workspace-setup-status'

export function useWorkspaceSetupStatus(enabled:boolean,userId:string|undefined,sessionToken?:string) {
  // Capture primitives: runtime configuration may change in place during a read.
  const workspaceId=runtimeConfig.workspace?.workspace.id
  const routingVersion=runtimeConfig.workspace?.workspace.routingVersion
  const slug=runtimeConfig.workspace?.workspace.slug
  const clusterId=runtimeConfig.workspace?.cluster.id
  const clusterUrl=runtimeConfig.workspace?.cluster.url
  const scope=enabled&&workspaceId&&userId
    ?JSON.stringify([clusterId,clusterUrl,workspaceId,slug,routingVersion,userId,sessionToken??'']):''
  const identity=useRef(scope);identity.current=scope
  const mounted=useRef(false),serial=useRef(0),pending=useRef<AbortController|null>(null)
  const [state,setState]=useState<{scope:string;loading:boolean;data:WorkspaceSetupStatus|null;error:string|null}>(
    {scope:'',loading:false,data:null,error:null})
  const cancelRead=useCallback(()=>{++serial.current;pending.current?.abort()},[])
  const refresh=useCallback(async()=>{
    const sameRuntime=()=>runtimeConfig.workspace?.workspace.id===workspaceId
      &&runtimeConfig.workspace?.workspace.routingVersion===routingVersion&&runtimeConfig.workspace?.workspace.slug===slug
      &&runtimeConfig.workspace?.cluster.id===clusterId&&runtimeConfig.workspace?.cluster.url===clusterUrl
    // A retained callback must not cancel or overwrite the new identity's read.
    if(!scope||!workspaceId||!userId||!mounted.current||identity.current!==scope||!sameRuntime())return null
    const ticket=++serial.current
    pending.current?.abort()
    const controller=new AbortController();pending.current=controller
    const current=()=>mounted.current&&!controller.signal.aborted&&serial.current===ticket
      &&identity.current===scope&&sameRuntime()
    setState({scope,loading:true,data:null,error:null})
    try{
      const {data:{session},error}=await supabase.auth.getSession()
      if(!current())return null
      if(error||!session?.access_token||session.user?.id!==userId
        ||sessionToken&&session.access_token!==sessionToken)throw new Error('session_required')
      const data=await loadWorkspaceSetupStatus({slug:slug!,workspaceId,routingVersion:routingVersion!,
        token:session.access_token,signal:controller.signal})
      if(!current())return null
      setState({scope,loading:false,data,error:null});return data
    }catch(error){
      if(!current())return null
      const support=error instanceof ControlHttpError&&error.requestId?` Mã hỗ trợ: ${error.requestId}.`:''
      const message=error instanceof ControlHttpError&&[401,403].includes(error.status)
        ?'Phiên đăng nhập không có quyền xem đăng ký này. Vui lòng đăng nhập lại bằng tài khoản chủ sở hữu.'
        :'Chưa xác nhận được tiến độ. Hãy kiểm tra lại kết quả trước khi gửi thông tin thiết lập.'
      setState({scope,loading:false,data:null,error:message+support});return null
    }
  },[scope,workspaceId,routingVersion,slug,clusterId,clusterUrl,userId,sessionToken])
  useEffect(()=>{
    mounted.current=true;void refresh()
    return()=>{mounted.current=false;cancelRead()}
  },[refresh,cancelRead])
  useEffect(()=>{
    if(!scope||state.scope!==scope||state.data?.nextAction!=='wait'||!state.data.retryAfter)return
    const timer=setTimeout(()=>{void refresh()},state.data.retryAfter*1000)
    return()=>clearTimeout(timer)
  },[scope,state,refresh])
  return {data:scope&&state.scope===scope?state.data:null,error:scope&&state.scope===scope?state.error:null,
    isLoading:!!scope&&(state.scope!==scope||state.loading),refresh}
}
