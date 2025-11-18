
export class AppError extends Error{ }

//create WebError that extends Error and takes a status code
export class WebError extends Error{
    constructor(message,status){
        super(message);
        this.status = status;
    }
}