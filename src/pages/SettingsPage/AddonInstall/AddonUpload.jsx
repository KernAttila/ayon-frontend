import { useEffect, useState } from 'react'
import { Button, FileUpload, SaveButton } from '@ynput/ayon-react-components'
import styled from 'styled-components'
import { ayonApi } from '/src/services/ayon'
import { useDispatch, useSelector } from 'react-redux'
import { useCreateInstallerMutation, useUploadInstallersMutation } from '/src/services/installers'
import { useUploadDependencyPackagesMutation } from '/src/services/dependencyPackages'
import { onUploadFinished, onUploadProgress } from '/src/features/context'
import axios from 'axios'

const StyledFooter = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  align-items: flex-start;
  gap: 8px;

  div {
    display: flex;
    width: 100%;
    gap: 4px;

    & > * {
      flex: 1;
    }
  }
`

const StyledProgressBar = styled.hr`
  height: 4px;
  border-radius: 2px;
  background-color: var(--md-sys-color-primary-container);

  width: ${({ $progress }) => $progress}%;
  border: none;
  margin: 4px 0;

  transition: width 0.3s;
`

const AddonUpload = ({ onClose, type = 'addon', onInstall, dropOnly, ...props }) => {
  const dispatch = useDispatch()
  const [files, setFiles] = useState([])
  const [isUploading, setIsUploading] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)
  const progress = useSelector((state) => state.context.uploadProgress)

  // installers
  const [createInstaller] = useCreateInstallerMutation()
  const [uploadInstallers] = useUploadInstallersMutation()
  // upload packages
  const [uploadPackages] = useUploadDependencyPackagesMutation()

  let endPoint = 'installers'
  if (type === 'package') endPoint = 'dependency_packages'
  const typeLabel =
    type === 'package' ? 'Dependency Package' : type === 'addon' ? 'Addon' : 'Installer'

  // first create the installer using the .json file
  const handleCreateInstaller = async (files) => {
    console.log('progress: creating ' + type, files)
    try {
      // now extract the .json data as an object for each file
      for (const { file: jsonFile } of files) {
        const data = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.readAsText(jsonFile)
          reader.onload = () => {
            try {
              const data = JSON.parse(reader.result)
              resolve(data)
            } catch (error) {
              reject(error)
            }
          }
          reader.onerror = () => {
            reject(reader.error)
          }
        })
        // Use the data object here
        // create installer with json data
        await createInstaller({ data, endPoint }).unwrap()
      }

      console.log('finished: created ' + type)
      return true
    } catch (error) {
      setErrorMessage(error?.response?.data?.detail)
      console.error(error)
      return false
    }
  }

  // then upload the the .exe file
  const handleUploadInstaller = async (files) => {
    const filesToUpload = files.map(({ file }) => ({ data: file }))
    console.log('progress: uploading ' + type, filesToUpload)
    try {
      let success, res
      if (type === 'installer') {
        res = await uploadInstallers({ files: filesToUpload, isNameEndpoint: true }).unwrap()
        success = true
      } else if (type === 'package') {
        res = await uploadPackages({ files: filesToUpload, isNameEndpoint: true }).unwrap()
        success = true
      } else success = false

      if (res.some((r) => r?.error)) {
        // filter and reduce down to an object with the error message
        const error = res.filter((r) => r?.error)[0].error
        throw error
      }

      console.log('finished: uploaded ' + type)
      return success
    } catch (error) {
      console.error(error?.detail || error)
      setErrorMessage(error?.detail || error)
      return false
    }
  }

  const handleInstallerPackage = async () => {
    const jsonFiles = files.filter((file) => file.file.name?.endsWith('.json'))
    const installerFiles = files.filter((file) => !file.file.name?.endsWith('.json'))
    // first check that there are two files, one .exe and one .json
    if (!jsonFiles.length && !installerFiles.length) {
      console.log('wrong file types')
      setErrorMessage(`Please upload at least one installer or .json file`)
      return
    }

    // start loading
    setIsUploading(true)
    setIsComplete(false)
    setErrorMessage(null)

    const onError = () => {
      setIsUploading(false)
      setIsComplete(true)
    }

    if (jsonFiles.length) {
      // first create the installers
      const createRes = await handleCreateInstaller(jsonFiles)
      // exit if there was an error
      if (!createRes) {
        onError()
        return
      }
    }

    if (installerFiles.length) {
      const uploadRes = await handleUploadInstaller(installerFiles)
      // exit if there was an error
      if (!uploadRes) {
        onError()
        return
      }
    }

    // const both = jsonFiles.length && installerFiles.length

    // let message = ''
    // if (both) {
    //   message = type + 's created and uploaded'
    // } else if (jsonFiles.length) {
    //   message = type + 's created'
    // } else if (installerFiles.length) {
    //   message = type + 's uploaded'
    // }

    setIsUploading(false)
    setIsComplete(true)

    setFiles([])

    onInstall(type)
  }

  const abortController = new AbortController()
  const cancelToken = axios.CancelToken
  const cancelTokenSource = cancelToken.source()

  const handleAddonInstall = async () => {
    let index = 0
    setIsUploading(true)
    try {
      for (const file of files) {
        const opts = {
          signal: abortController.signal,
          cancelToken: cancelTokenSource.token,
          onUploadProgress: (e) =>
            dispatch(
              onUploadProgress({
                progress: { loaded: e.loaded, total: e.total },
                index: index + 1,
                filesTotal: files.length,
              }),
            ),
        }

        await axios.post('/api/addons/install', file.file, opts)
        index++
      }
      setIsUploading(false)
      setIsComplete(true)

      setFiles([])
      onInstall(type)

      // update addon list
      dispatch(ayonApi.util.invalidateTags(['bundleList', 'addonList']))
    } catch (error) {
      console.log(error)
      setIsUploading(false)
      setIsComplete(true)
      dispatch(onUploadFinished())
      setErrorMessage('ERROR: ' + error?.response?.data?.detail)
    }
  }

  const handleSubmit = () => {
    if (type === 'addon') return handleAddonInstall()
    else return handleInstallerPackage()
  }

  // when dropOnly, auto upload when files has length
  useEffect(() => {
    if (files.length && dropOnly) handleSubmit()
  }, [files])

  let message = ''
  // complete message
  if (isComplete && !isUploading) {
    if (errorMessage) {
      message = <span style={{ color: 'var(--color-hl-error)' }}>{errorMessage}</span>
    } else {
      message = 'Upload complete!'
    }
  } else {
    if (type === 'addon') {
      message = 'Supports multiple .zip files.'
    } else {
      message = `Supports multiple .json and ${typeLabel}  files.`
    }
  }
  // default message

  //<Button onClick={handleAddonInstall} label="Install" disabled={!files?.length} />
  return (
    <FileUpload
      files={files}
      setFiles={setFiles}
      title={typeLabel + ' Uploader'}
      header={<></>}
      accept={type === 'addon' ? ['.zip'] : ['*']}
      allowMultiple
      placeholder={`Drop ${typeLabel} files`}
      isSuccess={isComplete}
      footer={
        !dropOnly && (
          <StyledFooter style={{ display: 'flex', width: '100%' }}>
            {message}
            {isUploading && <StyledProgressBar $progress={progress} />}
            <div>
              {onClose && <Button onClick={onClose} label="Close" />}
              <SaveButton
                active={files.length}
                label="Upload"
                onClick={handleSubmit}
                saving={isUploading}
              />
            </div>
          </StyledFooter>
        )
      }
      {...props}
    />
  )
}

export default AddonUpload
