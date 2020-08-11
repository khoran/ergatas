

// define a new console
class Logger {
    constructor(handlLogBuffer,annotateLog,bufferSize=10,_timeout=60){
        const self=this;
        self.buffer=[];
        self.maxBufferSize=bufferSize;
        self.timeout=_timeout;
        self.handleBufferFn = handlLogBuffer;
        self.annotateLogFn = annotateLog;
        
        var newConsole=(function(oldCons){
            return {
                //for local only logging
                local: function(message,...args){
                    oldCons.log(message,...args);
                },
                log: function(message,...args){
                    oldCons.log(message,...args);
                    self.log("log",message,{additionalInformation:args});
                },
                info: function (message,...args) {
                    oldCons.info(message,...args);
                    self.log("info",message,{additionalInformation:args});
                },
                warn: function (message,...args) {
                    oldCons.warn(message,...args);
                    self.log("warn",message,{additionalInformation:args});
                },
                error: function (message,...args) {
                    oldCons.error(message,...args);
                    self.log("error",message,{additionalInformation:args});
                }
            };
        }(console));

        //Then redefine the old console
        console = newConsole;

        setInterval(function(){self._flushBuffer();},self.timeout * 1000);
    }

    log(level,message,log){
        const self=this;
        log.level= level;
        log.message= message;
        log.timestamp=  Date.now();

        if(self.annotateLogFn != null)
            log = self.annotateLogFn(log);

        self.buffer.push(log);
        if(self.buffer.length >= self.maxBufferSize ){
            self._flushBuffer();
        }
    }
    _flushBuffer(){
        const self=this;
        console.local("flushing buffer, size: "+self.buffer.length);
        if(self.buffer.length === 0)
            return;
        try{

            self.handleBufferFn(self.buffer).
                then(() => {
                    self.buffer=[];
                }).catch((error)=>{
                    //console.error("failed to post log buffer",error);
                    //if we keep failing to post the buffer, 
                    // make sure it never gets too big. 
                    if(self.buffer.length > 1000){
                        self.buffer=[];
                    }
                });
        }catch(error){
            //clear the buffer, as it is liekly the cause of the exception being thrown
            self.buffer = [];
            console.error("failed to flush buffer: ",error);
        }

    }

}
    
export default Logger;