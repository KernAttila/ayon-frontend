import { useNavigate } from 'react-router-dom'

import { Sidebar } from 'primereact/sidebar'
import ProjectList from '/src/containers/projectList'
import { useDispatch, useSelector } from 'react-redux'
import { selectProject } from '/src/features/project'
import {
  selectProject as selectProjectContext,
  setProjectMenuOpen,
  setUri,
} from '/src/features/context'
import { onProjectChange } from '/src/features/editor'
import { ayonApi } from '/src/services/ayon'
import { Button } from '@ynput/ayon-react-components'

const ProjectMenu = () => {
  const navigate = useNavigate()
  const dispatch = useDispatch()

  const projectName = useSelector((state) => state.project.name)
  const projectMenuOpen = useSelector((state) => state.context.projectMenuOpen)

  const onHide = () => {
    dispatch(setProjectMenuOpen(false))
  }

  const onProjectSelect = (projectName) => {
    onHide()

    // if already on project page, do not navigate
    if (window.location.pathname.includes(projectName)) return

    // reset selected folders
    dispatch(selectProject(projectName))
    // reset context for projects
    dispatch(selectProjectContext(projectName))
    // reset editor
    dispatch(onProjectChange(projectName))
    // remove editor query caches
    dispatch(ayonApi.util.invalidateTags(['branch', 'workfile', 'hierarchy', 'project', 'product']))
    // reset uri
    dispatch(setUri(`ayon+entity://${projectName}`))

    // if projects/[project] is null, projects/[projectName]/browser, else projects/[projectName]/[module]
    const link = window.location.pathname.includes('projects')
      ? `/projects/${projectName}/${window.location.pathname.split('/')[3] || 'browser'}`
      : `/projects/${projectName}/browser`

    navigate(link)
  }

  return (
    <Sidebar position="left" visible={projectMenuOpen} onHide={onHide}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          width: '100%',
          height: '100%',
          gap: 8,
        }}
      >
        <Button
          icon="empty_dashboard"
          label="Manage Projects"
          style={{ marginTop: 1, width: '100%' }}
          onClick={() => navigate('/manageProjects')}
        />
        <ProjectList
          onRowClick={(e) => onProjectSelect(e.data.name)}
          selection={projectName}
          onHide={onHide}
          isCollapsible={false}
        />
      </div>
    </Sidebar>
  )
}

export default ProjectMenu
