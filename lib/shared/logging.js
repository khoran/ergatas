

// define a new console
class Logger {
    constructor(handlLogBuffer,annotateLog,bufferSize=100,_timeout=60){
        const self=this;
        self.buffer=[];
        self.maxBufferSize=bufferSize;
        self.timeout=_timeout;
        self.handleBufferFn = handlLogBuffer;
        self.annotateLogFn = annotateLog;
  /*      
        var newConsole=(function(oldCons){
            return {
                //for local only logging
                local: function(message,...args){
                    oldCons.log(message,...args);
                },
                log: function(message,...args){
                    if(process.env.NODE_ENV === "development" || console.ergatas_debug){
                        oldCons.log(message,...args);
                        self.log("log",message,{additionalInformation:args});
                    }
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
*/
       //modify the real console so we don't lose
       //other members of it.

        var orig = {};
        orig.log = console.log;
        orig.info = console.info;
        orig.warn = console.warn;
        orig.error = console.error;
        

        //bypass sending messages back to server
        console.local = function(message,...args){
                    orig.log(message,...args);
                };
        console.log = function(message,...args){
                       if(process.env.NODE_ENV === "development" || console.ergatas_debug){
                           orig.log(message,...args);
                           self.log("log",message,{additionalInformation:args});
                       }
                     };
        console.info= function (message,...args) {
                    orig.info(message,...args);
                    self.log("info",message,{additionalInformation:args});
                };
        console.warn= function (message,...args) {
                    orig.warn(message,...args);
                    self.log("warn",message,{additionalInformation:args});
                };
        console.error= function (message,...args) {
                    orig.error(message,...args);
                    self.log("error",message,{additionalInformation:args});
                };


        setInterval(function(){self._flushBuffer();},self.timeout * 1000);
    }

    log(level,message,log){
        const self=this;
        log.level= level;
        log.message= message;
        log.timestamp=  Date.now();

        try{
            JSON.stringify(log.additionalInformation);
        }catch(error){
            console.local("failed to stringify additional arguments: ",error);
            log.additionalInformation="FAILED TO STRINGIFY";
        }

        if(self.annotateLogFn != null)
            log = self.annotateLogFn(log);

        self.buffer.push(log);
        if(self.buffer.length >= self.maxBufferSize ){
            self._flushBuffer();
        }
    }
    _flushBuffer(){
        const self=this;
        if(self.buffer.length === 0)
            return;
        //console.local("flushing buffer, size: "+self.buffer.length);
        try{

            const localBuffer = self.buffer;
            self.buffer=[];
            self.handleBufferFn(localBuffer).
                catch((error)=>{
                    console.local("failed to post log buffer: "+error.message,JSON.stringify(error));
                    //try one more time after a short delay
                    setTimeout(function(){
                        self.handleBufferFn(localBuffer);
                    },1000);

                });
        }catch(error){
            console.error("failed to flush buffer: "+error.message,error);
        }

    }

}
    
export default Logger;
