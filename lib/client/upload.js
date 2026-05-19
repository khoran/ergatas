
import '@uppy/core/dist/style.css'
import '@uppy/dashboard/dist/style.css'
import '@uppy/image-editor/dist/style.css'
import '@uppy/webcam/dist/style.css'
import '@uppy/screen-capture/dist/style.css'

import Uppy from '@uppy/core'
import Dashboard from '@uppy/dashboard'
import Dropbox from '@uppy/dropbox'
import Facebook from '@uppy/facebook'
import GoogleDrivePicker from '@uppy/google-drive-picker'
import ImageEditor from '@uppy/image-editor'
import Instagram from '@uppy/instagram'
import OneDrive from '@uppy/onedrive'
import ScreenCapture from '@uppy/screen-capture'
import Transloadit from '@uppy/transloadit'
import Webcam from '@uppy/webcam'

const TRANSLOADIT_AUTH_KEY =
    process.env.TRANSLOADIT_AUTH_KEY || 'f5e160d453964b0485b61eb0f61a28ba'

const COMPANION_URL = Transloadit.COMPANION_URL
const COMPANION_ALLOWED_HOSTS = Transloadit.COMPANION_ALLOWED_HOSTS

const DASHBOARD_META_FIELDS = [
    { id: 'name', name: 'Name', placeholder: 'file name' },
]

const REMOTE_SOURCE_PLUGINS = [
    { id: 'Dropbox', Plugin: Dropbox },
    //{ id: 'Instagram', Plugin: Instagram },
    //{ id: 'Facebook', Plugin: Facebook },
    { id: 'OneDrive', Plugin: OneDrive },
]

function trimEnvValue(value) {

    return typeof value === 'string' ? value.trim() : value
}

function getDashboardOptions(inline) {
    return {
        inline,
        closeAfterFinish: false,
        hideProgressAfterFinish: false,
        showProgressDetails: true,
        metaFields: DASHBOARD_META_FIELDS,
    }
}

function getRemoteSourceOptions() {
    return {
        target: Dashboard,
        companionUrl: COMPANION_URL,
        companionAllowedHosts: COMPANION_ALLOWED_HOSTS,
    }
}

function getGoogleDrivePickerOptions() {
    const clientId = trimEnvValue(process.env.GOOGLE_OAUTH_CLIENT_ID)
    const apiKey = trimEnvValue(process.env.GOOGLE_API_KEY)
    const appId = trimEnvValue(process.env.GOOGLE_PROJECT_NUMBER)

    if (!clientId || !apiKey || !appId) {
        return null
    }

    return {
        ...getRemoteSourceOptions(),
        clientId,
        apiKey,
        appId,
    }
}

function createAssemblyOptions(templateId, fields) {
    return {
        fields,
        params: {
            auth: { key: TRANSLOADIT_AUTH_KEY },
            template_id: templateId,
        },
    }
}

function registerRemoteSources(uppy) {
    const remoteSourceOptions = getRemoteSourceOptions()

    REMOTE_SOURCE_PLUGINS.forEach(({ id, Plugin }) => {
        uppy.use(Plugin, remoteSourceOptions)
    })

    const googleDrivePickerOptions = getGoogleDrivePickerOptions()
    if (googleDrivePickerOptions) {
        uppy.use(GoogleDrivePicker, googleDrivePickerOptions)
    }
}

function buildUppy({ restrictions, templateId, fields, inline = false }) {
    const uppy = new Uppy({
        autoProceed: false,
        allowMultipleUploadBatches: false,
        restrictions,
    })

    uppy.use(Dashboard, getDashboardOptions(inline))

    uppy.use(ImageEditor, {
        target: Dashboard,
        quality: 0.8,
        cropperOptions: {
            aspectRatio: 1,
        },
    })

    registerRemoteSources(uppy)

    uppy.use(Webcam, {
        target: Dashboard,
        showRecordingLength: true,
    })

    uppy.use(ScreenCapture, {
        target: Dashboard,
    })

    uppy.use(Transloadit, {
        waitForEncoding: true,
        assemblyOptions: createAssemblyOptions(templateId, fields),
    })

    return uppy
}

function createSingleImageUploader(templateId, fields, maxFileSize) {
    return buildUppy({
        templateId,
        fields,
        restrictions: {
            maxFileSize,
            minFileSize: 0,
            maxNumberOfFiles: 1,
            minNumberOfFiles: 1,
            allowedFileTypes: ['image/*', '.jpg', '.jpeg', '.png'],
        },
    })
}

export function orgUploader(organization_key) {
    return createSingleImageUploader(
        process.env.ORG_LOGO_UPLOAD_TEMPLATE,
        { organization_key },
        1 * 1024 * 1024,
    )
}

export function profileUploader(prefix) {
    return createSingleImageUploader(
        process.env.PROFILE_UPLOAD_TEMPLATE,
        { userId: prefix },
        15 * 1024 * 1024,
    )
}

export function generalFileUploader(prefix) {
    return buildUppy({
        templateId: process.env.GENERAL_FILE_UPLOAD_TEMPLATE,
        fields: { userId: prefix },
        restrictions: {
            maxFileSize: 5 * 1024 * 1024,
            maxNumberOfFiles: Number(process.env.MAX_USER_FILES || 10),
        },
    })
}
