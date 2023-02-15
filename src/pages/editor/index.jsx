import axios from 'axios'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { toast } from 'react-toastify'
import {
  Spacer,
  Button,
  Section,
  Toolbar,
  TablePanel,
  InputSwitch,
} from '@ynput/ayon-react-components'

import { TreeTable } from 'primereact/treetable'
import { Column } from 'primereact/column'
import { ContextMenu } from 'primereact/contextmenu'

import usePubSub from '/src/hooks/usePubSub'
import { getTaskTypeIcon } from '/src/utils'
import sortByKey from '/src/helpers/sortByKey'

import {
  editorSelectionChanged,
  setBreadcrumbs,
  setExpandedFolders,
  setFocusedFolders,
} from '/src/features/context'

import { buildQuery } from './queries'
import { getColumns, formatName, formatType, formatAttribute } from './utils'
import { stringEditor, typeEditor } from './editors'
import { loadBranch, getUpdatedNodeData } from './loader'
import { MultiSelect } from 'primereact/multiselect'
import useLocalStorage from '/src/hooks/useLocalStorage'
import { useGetHierarchyQuery } from '/src/services/getHierarchy'
import SearchDropdown from '/src/components/SearchDropdown'
import useColumnResize from '/src/hooks/useColumnResize'
import { isEmpty } from 'lodash'
import { useContext } from 'react'
import { UtilContext } from '/src/context/utilsContext'

const EditorPage = () => {
  const { getTypeField } = useContext(UtilContext) || {}
  const [loading, setLoading] = useState(false)

  // BUG: this is required for editing to work
  // eslint-disable-next-line no-unused-vars
  const context = useSelector((state) => ({ ...state.context }))
  const projectName = useSelector((state) => state.project.name)
  const focusedFolders = useSelector((state) => state.context.focused.folders)
  // focused editor is a mixture of focused folders and tasks
  const focusedEditor = useSelector((state) => state.context.focused.editor)
  const expandedFolders = useSelector((state) => state.context.expandedFolders)
  const focusedTasks = useSelector((state) => state.context.focused.tasks)

  const dispatch = useDispatch()

  let [nodeData, setNodeData] = useState({})
  const [changes, setChanges] = useState({})
  const [newNodes, setNewNodes] = useState([])
  const [errors, setErrors] = useState({})
  const [selectionLocked, setSelectionLocked] = useState(false)
  // SEARCH STATES
  // object with folderIds, task parentsIds and taskNames
  const [searchIds, setSearchIds] = useState({})

  // columns widths
  const [columnsWidths, setColumnWidths] = useColumnResize('editor')

  const contextMenuRef = useRef(null)

  // Hierarchy data is used for fast searching
  const { data: hierarchyData, isLoading: isSearchLoading } = useGetHierarchyQuery({ projectName })

  //
  // Helpers
  //

  let columns = useMemo(() => getColumns(), [])
  const query = useMemo(() => buildQuery(), [])

  const formatError = (rowData) => {
    // Format the error icon for the given row
    // If the row has no error, return null,
    // otherwise return the error icon with the error message
    // as tooltip.
    const error = errors[rowData.id]
    if (error) {
      return (
        <span
          className={`material-symbols-outlined`}
          style={{ color: 'var(--color-hl-error)' }}
          title={error}
        >
          warning
        </span>
      )
    }
  }

  //
  // HOOKS
  //

  useEffect(() => {
    console.log('getting new data')
    setLoading(true)
    const expandedKeys = [...Object.keys(expandedFolders), 'root']

    getUpdatedNodeData(
      nodeData,
      newNodes,
      expandedKeys,
      parents,
      query,
      projectName,
      searchIds,
    ).then((result) => {
      setNodeData(result)
      setLoading(false)
    })
  }, [expandedFolders, newNodes])

  // on first render, get selection from focused folders and tasks
  // for further selections, focusedEditor is used
  useEffect(() => {
    // if there are tasks focused, only select those
    if (focusedTasks.length) {
      dispatch(editorSelectionChanged({ selection: focusedTasks }))
      // if a task was focused in hierarchy then the folder must have been focused too
      // and therefore the folder would also have already been expanded in hierarchy
    } else {
      // otherwise, select the focused folders
      dispatch(editorSelectionChanged({ selection: focusedFolders }))
    }
  }, [])

  //
  // External events handling
  //

  const handlePubSub = async (topic, message) => {
    // TODO add this to RTK QUERY
    if (topic !== 'entity.update') return
    if (message.project?.toLowerCase() !== projectName.toLowerCase()) return

    const getEntity = async (entityType, entityId) => {
      let data = {}
      try {
        const result = await axios.get(`/api/projects/${projectName}/${entityType}s/${entityId}`)
        data = result.data
      } catch {
        toast.error(`Error loading ${entityType} ${entityId}`)
      }
      return data
    }

    const updateEntities = async (entityType, ids) => {
      const patch = {}
      for (const entityId of ids) {
        const newEntity = await getEntity(entityType, entityId)
        patch[entityId] = newEntity
      }
      if (isEmpty(patch)) return

      setNodeData((nd) => {
        const result = { ...nd }
        for (const entityId in patch) {
          const row = { ...result[entityId] }
          Object.assign(row.data, patch[entityId])
          result[entityId] = row
        }
        return result
      })
    }

    // This is used just to get the current list of nodes to be updated
    setNodeData((nd) => {
      const toUpdate = message.summary.ids.filter((id) => id in nd)
      if (toUpdate.length) updateEntities(message.summary.entityType, toUpdate)
      return nd
    })
  } // handlePubSub

  // PUBSUB HOOK (Currently broken handlePubSub)
  usePubSub('entity.task', handlePubSub)

  usePubSub('entity.folder', handlePubSub)

  //
  // Build hierarchy
  //

  // console.log(searchIds)

  // SEARCH FILTER
  // if search results filter out nodes
  const filteredNodeData = useMemo(() => {
    const filtered = { ...nodeData }
    if (searchIds) {
      const { folderIds = [], taskNames = [] } = searchIds
      for (const key in filtered) {
        if (folderIds.length && !folderIds.includes(key)) {
          if (!filtered[key].leaf) {
            delete filtered[key]
          } else if (taskNames.length && !taskNames.includes(filtered[key].data.name)) {
            delete filtered[key]
          }
        }
      }
    }

    return filtered
  }, [nodeData, searchIds])

  const parents = useMemo(() => {
    // This is an auto-generated object in the form of:
    //   { parentId: [child1Id, child2Id....]
    // It is updated when nodeData changes and it speeds up
    // building hierarchy

    const result = {}
    for (const childId in filteredNodeData) {
      const parentId = filteredNodeData[childId].data.__parentId
      if (!(parentId in result)) result[parentId] = []
      result[parentId].push(childId)
    }
    return result
  }, [filteredNodeData])

  // Build hierarchical data for the TreeTable component
  // Trigger the rebuild when parents are updated (which are
  // updated after nodeData update. Both nodeData and parents
  // are needed for the hierarchy, so thi cascading makes
  // it possible)

  let treeData = useMemo(() => {
    if (isEmpty(parents)) {
      return []
    }
    const result = []

    const buildHierarchy = (parentId, target) => {
      if (!parents[parentId]) return
      for (const childId of parents[parentId]) {
        const node = {
          key: childId,
          name: nodeData[childId].data.name,
          data: nodeData[childId].data,
          leaf: nodeData[childId].leaf,
        }
        if (!node.leaf) {
          node.children = []
          if (childId in expandedFolders) buildHierarchy(childId, node.children)
        }
        target.push(node)
      }
    }

    buildHierarchy('root', result)
    return sortByKey(result, 'name')
  }, [parents])

  let foundTasks = []
  const getFolderTaskList = (folders = [], parentId, d) => {
    let searchList = []
    let depth = d || 0
    folders.forEach((folder) => {
      searchList.push({
        id: folder.id,
        label: folder.name,
        value: folder.name,
        parentId: parentId,
        children: folder.children || [],
        taskNames: folder.taskNames,
        keywords: [folder.name, folder.folderType].map((k) => k.toLowerCase()),
        depth: depth,
        icon: getTypeField('folders', folder.folderType, 'icon'),
        isTask: false,
      })

      // add tasks to list if not already found
      folder.taskNames?.forEach((task) => {
        if (!foundTasks.includes(task)) {
          foundTasks.push(task)
          searchList.push({
            id: folder.id + task,
            label: task,
            value: task,
            icon: getTaskTypeIcon(task),
            depth: depth + 1,
            keywords: [task],
            taskNames: [],
            isTask: true,
          })
        }
      })

      if (folder.children?.length) {
        searchList = searchList.concat(getFolderTaskList(folder.children, folder.id, depth + 1))
      }
    })

    return searchList
  }

  // create a flat list of everything searchable, folders and tasks
  let searchabledFolders = useMemo(
    () => getFolderTaskList(hierarchyData).sort((a, b) => a.depth - b.depth),
    [hierarchyData],
  )

  // create a set that can be used to look up a specific id
  const searchabledFoldersSet = useMemo(() => {
    const res = new Map()

    for (const folder of searchabledFolders) {
      res.set(folder.id, { parent: folder.parentId, childrenLength: folder.childrenLength })
    }

    return res
  }, [searchabledFolders])

  const searchFilter = (search, suggestions) => {
    // filter through suggestions
    const filtered = suggestions.filter((folder) =>
      folder.keywords.some((key) => key.includes(search)),
    )
    return filtered
  }

  const handleSearchComplete = (result, search) => {
    let folderIds = [],
      taskNames = []
    let results = result

    // look for tasks in results and add matching folders
    result.forEach((res) => {
      if (!res.isTask) return

      // find all
      searchabledFolders.forEach(
        (folder) =>
          folder.taskNames.includes(res.value) &&
          !folderIds.includes(folder.id) &&
          results.push(folder),
      )
    })

    // find all parent ids for each id
    results.forEach((folder) => {
      if (folder.isTask) return

      // add folder id
      folderIds.push(folder.id)

      // if folder has tasks add folderId and taskName
      if (folder.taskNames.length && folder.taskNames.some((n) => n.includes(search))) {
        // are any of the task names match with the search
        folder.taskNames.forEach(
          (name) => name.includes(search) && !taskNames.includes(name) && taskNames.push(name),
        )
      }
      // get folders parentId
      const getAllParents = (folder, id) => {
        const childId = id || folder.id
        const parentId = searchabledFoldersSet.get(childId).parent
        if (parentId && !folderIds.includes(parentId)) {
          // add parent id
          folderIds.push(parentId)
          // see if parent id has it's own parentId
          getAllParents(folder, parentId)
        }
      }
      getAllParents(folder)

      const getAllChildren = (folder) => {
        // add all children and taskNames to folders
        folder.children?.forEach((child) => {
          if (!folderIds.includes(child.id)) folderIds.push(child.id)

          if (child.children) getAllChildren(child)
        })
      }
      getAllChildren(folder)
    })

    setSearchIds({ folderIds, taskNames })
  }

  const currentSelection = useMemo(() => {
    // This object holds the information on current selected nodes.
    // It has the same structure as nodeData, e.g. {objecId: nodeData, ...}
    // so it is compatible with the treetable selection argument and it
    // also provides complete node information
    const result = {}
    for (const key of focusedEditor) result[key] = nodeData[key]

    return result
  }, [focusedEditor, nodeData])

  //
  // Update handlers
  //

  const updateAttribute = (options, value) => {
    setChanges((changes) => {
      for (const id in currentSelection) {
        changes[id] = changes[id] || {
          __entityType: nodeData[id].data.__entityType,
          __parentId: nodeData[id].data.__parentId,
        }
        changes[id][options.field] = value
      }
      return changes
    })

    // Force table render when selection is locked
    if (selectionLocked) dispatch(setFocusedFolders(focusedFolders))
  }

  const updateName = (options, value) => {
    const id = options.rowData.id
    const rowChanges = changes[id] || {
      __entityType: options.rowData.__entityType,
      __parentId: options.rowData.__parentId,
    }
    rowChanges['_name'] = value
    setChanges((changes) => {
      return { ...changes, [id]: rowChanges }
    })
  }

  const updateType = (options, value) => {
    const id = options.rowData.id
    const rowChanges = changes[id] || {
      __entityType: options.rowData.__entityType,
      __parentId: options.rowData.__parentId,
    }
    const key = options.rowData.__entityType === 'folder' ? '_folderType' : '_taskType'
    rowChanges[key] = value
    setChanges((changes) => {
      return { ...changes, [id]: rowChanges }
    })
  }

  //
  // Commit changes
  //

  const getBranchesToReload = (entityId) => {
    let result = [entityId]
    if (!parents[entityId]) return result
    for (const chId of parents[entityId]) {
      if (chId in parents) result = [...result, ...getBranchesToReload(chId)]
    }
    return result
  }

  const onCommit = useCallback(() => {
    const branchesToReload = []
    const operations = []

    // PATCH / DELETE EXISTING ENTITIES

    for (const entityId in changes) {
      if (entityId.startsWith('newnode')) continue

      const entityType = changes[entityId].__entityType
      const parentId = changes[entityId].__parentId

      if (changes[entityId].__action === 'delete') {
        operations.push({
          id: entityId,
          type: 'delete',
          entityType,
          entityId,
        })
      } else {
        // End delete, begin patch
        const attribChanges = {}
        const entityChanges = {}

        for (const key in changes[entityId]) {
          if (key.startsWith('__')) continue
          if (key.startsWith('_')) entityChanges[key.substring(1)] = changes[entityId][key]
          else attribChanges[key] = changes[entityId][key]
        }

        operations.push({
          id: entityId,
          type: 'update',
          entityType,
          entityId,
          data: { ...entityChanges, attrib: attribChanges },
        })
      } // Patch

      if (!branchesToReload.includes(parentId)) branchesToReload.push(parentId)
      for (const eid of getBranchesToReload(entityId)) {
        if (!branchesToReload.includes(eid)) branchesToReload.push(eid)
      }
    } // PATCH EXISTING ENTITIES

    //
    // CREATE NEW ENTITIES
    //

    for (const entity of newNodes) {
      const entityType = entity.__entityType
      const newEntity = { ...entity }
      const entityChanges = changes[entity.id]

      // it is a new entity, so only valid attributes are those
      // stored in `changes`. The rest are inherited ones
      newEntity.attrib = {}
      for (const key in entityChanges || {}) {
        if (key.startsWith('__')) continue
        if (key.startsWith('_')) newEntity[key.substring(1)] = entityChanges[key]
        else {
          newEntity.attrib[key] = entityChanges[key]
        }
      }

      operations.push({
        id: entity.id,
        type: 'create',
        entityType,
        data: newEntity,
      })

      // just reload the parent branch. new entities don't have children
      if (!branchesToReload.includes(newEntity.parentId)) branchesToReload.push(newEntity.parentId)
    } // CREATE NEW ENTITIES

    // Send the changes to the server

    setLoading(true)
    axios
      .post(`/api/projects/${projectName}/operations`, { operations })
      .then((res) => {
        // console.log("OPS result", res.data.operations)

        if (!res.data.success) {
          toast.warn('Errors occured during save')
        }

        const updated = res.data.operations
          .filter((op) => op.type === 'update' && op.success)
          .map((op) => op.id)
        const created = res.data.operations
          .filter((op) => op.type === 'create' && op.success)
          .map((op) => op.id)
        const deleted = res.data.operations
          .filter((op) => op.type === 'delete' && op.success)
          .map((op) => op.id)

        const affected = [...created, ...updated, ...deleted]

        setErrors(() => {
          const result = {}
          for (const op of res.data.operations) {
            if (!op.success) result[op.id] = op.error
          }
          return result
        })

        // Remove succesfully created nodes from the newNodes list
        setNewNodes((nodes) => nodes.filter((n) => !created.includes(n.id)))

        // Remove successful operations from the changes
        setChanges((nodes) => {
          const result = {}
          for (const id of Object.keys(nodes).filter((n) => !affected.includes(n))) {
            result[id] = nodes[id]
          }
          return result
        }) // setChanges

        // Create a new nodeData object with the updated data. Reload the
        // branches that were affected by the changes
        setNodeData(async (nodes) => {
          for (const id in nodes) {
            if (affected.includes(id)) delete nodes[id]
          }
          // Reload affected branches
          for (const branch of branchesToReload) {
            const res = await loadBranch(query, projectName, branch)
            Object.assign(nodes, res)
          }
          // Keep failed new nodes in node data
          for (const nodeId of newNodes) {
            if (created.includes(nodeId)) continue
            nodes[nodeId] = newNodes[nodeId]
          }
          return nodes
        }) // setNodeData
      }) // Successful post
      .catch((err) => {
        // Error status should only happen if the server is down
        // Request is VERY malformed or there is a bug in the server.
        toast.error("Unable to save changes. This shouldn't happen.")
        console.log('ERROR', err)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [newNodes, changes, query, projectName]) // commit

  //
  // Adding new nodes
  //

  const futureParents = useMemo(() => {
    // Returns a list of node ids from the current selection
    // for which children creation is available
    let parents = []
    for (const parentId in currentSelection) {
      const node = currentSelection[parentId]
      if (!node) continue
      // unable to add children to unsaved nodes
      if (node.data.id?.startsWith('newnode')) continue
      // unable to add children to tasks
      if (node.data.__entityType !== 'folder') continue
      parents.push(parentId)
    }
    return parents
  }, [currentSelection])

  const canAdd = futureParents.length > 0
  const canCommit = !isEmpty(changes) || newNodes.length

  const addNode = (entityType, root) => {
    const parents = root ? [null] : futureParents

    if (!parents.length) {
      console.log('Nothing to add')
      return
    }

    if (!root) {
      // Adding children to existing nodes, so
      // ensure the parents are not leaves
      setNodeData((nodeData) => {
        for (const parentId of parents) nodeData[parentId].leaf = false
        return nodeData
      })
    }

    setNewNodes((nodes) => {
      let i = 0
      let newNodes = []
      for (const parentId of parents) {
        const id = `newnode${nodes.length + i}`
        const newNode = {
          id,
          attrib: { ...(nodeData[parentId]?.data.attrib || {}) },
          ownAttrib: [],
          __entityType: entityType,
          __parentId: parentId || 'root',
        }
        if (entityType === 'folder') newNode['parentId'] = parentId
        else if (entityType === 'task') {
          newNode['folderId'] = parentId
          newNode['taskType'] = 'Generic'
        }
        newNodes.push(newNode)
        i++
      }
      return [...nodes, ...newNodes]
    })

    if (!root) {
      // Update expanded folders context object
      const exps = { ...expandedFolders }
      for (const id of parents) exps[id] = true
      dispatch(setExpandedFolders(exps))
    }
  } // Add node

  //
  // Other user events handlers (Toolbar)
  //

  const onDelete = () => {
    // Mark the current selection for deletion.
    setNewNodes((newNodes) => {
      return newNodes.filter((node) => !(node.id in currentSelection))
    })

    setChanges((changes) => {
      for (const id in currentSelection) {
        if (id.startsWith('newnode')) continue
        changes[id] = changes[id] || {
          __entityType: nodeData[id].data.__entityType,
          __parentId: nodeData[id].data.__parentId,
        }
        changes[id].__action = 'delete'
      }
      return changes
    })
  }

  const onRevert = () => {
    setChanges({})
    setNewNodes([])
  }

  const revertChangesOnSelection = useCallback(() => {
    const modifiedIds = Object.keys(changes).filter((i) => i in currentSelection)
    const newIds = newNodes.map((i) => i.id).filter((i) => i in currentSelection)

    setNewNodes((nodes) => {
      return nodes.filter((i) => !newIds.includes(i.id))
    })
    setChanges((nodes) => {
      const result = {}
      for (const id in nodes) {
        if (!modifiedIds.includes(id)) result[id] = nodes[id]
      }
      return result
    })
  }, [currentSelection, changes, newNodes])

  const onAddFolder = () => addNode('folder')
  const onAddRootFolder = () => addNode('folder', true)
  const onAddTask = () => addNode('task')

  // Context menu

  const onContextMenuSelectionChange = (event) => {
    // TODO: handle tasks
    if (!(event.value in currentSelection)) {
      dispatch(setFocusedFolders([event.value]))
    }
  }

  const contextMenuModel = useMemo(() => {
    return [
      {
        label: 'Copy attributes',
        disabled: Object.keys(currentSelection) !== 1,
        command: () => alert('Not implemented'),
      },
      {
        label: 'Paste attributes',
        disabled: true,
        command: () => alert('Not implemented'),
      },
      {
        label: 'Revert changes',
        command: revertChangesOnSelection,
      },
      {
        label: 'Delete',
        command: onDelete,
      },
    ]
  }, [currentSelection])

  //
  // Table event handlers
  //

  const onToggle = (event) => {
    dispatch(setExpandedFolders(event.value))
  }

  const onSelectionChange = (event) => {
    // block new selection if the selection is locked
    if (selectionLocked) return

    const selection = Object.keys(event.value)
    // reduce into two arrays, one with type folder and one with type task
    const folders = []
    const tasks = []
    for (const [key, value] of Object.entries(event.value)) {
      if (nodeData[key]?.data.__entityType === 'folder' && value) folders.push(key)
      else if (nodeData[key]?.data.__entityType === 'task' && value) tasks.push(key)
    }

    // for each task in tasks, add __parentId to folders if not already there
    for (const task of tasks) {
      const folder = nodeData[task].data.__parentId
      if (!folders.includes(folder)) folders.push(folder)
    }

    // update redux store
    dispatch(editorSelectionChanged({ folders, tasks, selection }))
  }

  const onRowClick = (event) => {
    const node = event.node.data
    if (node.__entityType !== 'folder') return
    dispatch(
      setBreadcrumbs({
        parents: node.parents,
        folder: node.name,
      }),
    )
  }

  const filterOptions = [{ name: 'name' }, { name: 'type' }, ...columns].map(({ name }) => ({
    value: name,
    label: name,
  }))
  const allColumnsNames = filterOptions.map(({ value }) => value)

  const [shownColumns, setShownColumns] = useLocalStorage(
    'editor-columns-filter-single',
    allColumnsNames,
  )

  const handleColumnsFilter = (e) => {
    e.preventDefault()
    const newArray = e.target.value || []

    if (newArray.length) {
      // make sure there's always at least one column

      setShownColumns(newArray)
    }
  }

  const handleColumnReorder = (e) => {
    const localStorageOrder = e.columns.reduce(
      (acc, cur, i) => ({ ...acc, [cur.props.field]: i }),
      {},
    )

    localStorage.setItem('editor-columns-order', JSON.stringify(localStorageOrder))
  }

  let allColumns = [
    <Column
      field="name"
      key="name"
      header="Name"
      expander={true}
      body={(rowData) => formatName(rowData.data, changes, true, getTypeField)}
      style={{ width: columnsWidths['name'], maxWidth: 300, height: 33 }}
      editor={(options) => {
        return stringEditor(
          options,
          updateName,
          formatName(options.rowData, changes, false, getTypeField),
        )
      }}
    />,
    <Column
      field="type"
      key="type"
      header="Type"
      body={(rowData) => formatType(rowData.data, changes)}
      style={{ width: columnsWidths['type'], maxWidth: 200 }}
      editor={(options) => {
        return typeEditor(options, updateType, formatType(options.rowData, changes, false))
      }}
    />,
    ...columns.map((col) => (
      <Column
        key={col.name}
        header={col.title}
        field={col.name}
        style={{ width: columnsWidths[col.name] }}
        body={(rowData) => formatAttribute(rowData.data, changes, col.name)}
        editor={(options) => {
          return col.editor(
            options,
            updateAttribute,
            formatAttribute(options.rowData, changes, col.name, false),
            col.editorSettings,
          )
        }}
      />
    )),
  ]

  // sort columns if localstorage set
  let columnsOrder = localStorage.getItem('editor-columns-order')
  if (columnsOrder) {
    try {
      columnsOrder = JSON.parse(columnsOrder)
      allColumns.sort((a, b) => columnsOrder[a.props.field] - columnsOrder[b.props.field])
    } catch (error) {
      console.log(error)
      // remove local stage
      localStorage.removeItem('editor-columns-order')
    }
  }

  // only filter columns if required
  if (shownColumns.length < allColumns.length) {
    allColumns = allColumns.filter(({ props }) => shownColumns.includes(props.field))
  }

  // sort columns

  //
  // Render the TreeTable

  return (
    <main>
      <Section>
        <Toolbar>
          <Button
            icon="create_new_folder"
            label="Add folder"
            disabled={!canAdd}
            onClick={onAddFolder}
          />
          <Button icon="add_task" label="Add task" disabled={!canAdd} onClick={onAddTask} />
          <Button icon="create_new_folder" label="Add root folder" onClick={onAddRootFolder} />
          <Button label="Delete selected" icon="delete" onClick={onDelete} />

          <Spacer />
          <Button icon="close" label="Revert Changes" onClick={onRevert} disabled={!canCommit} />
          <Button icon="check" label="Commit Changes" onClick={onCommit} disabled={!canCommit} />
        </Toolbar>
        <Toolbar>
          <SearchDropdown
            filter={searchFilter}
            suggestions={searchabledFolders}
            suggestionsLimit={5}
            onSubmit={handleSearchComplete}
            onClear={() => searchIds && setSearchIds({})}
            isLoading={isSearchLoading}
          />
          <MultiSelect
            options={filterOptions}
            value={shownColumns}
            onChange={handleColumnsFilter}
            placeholder={`Show Columns`}
            fixedPlaceholder={shownColumns.length >= filterOptions.length}
            style={{ maxWidth: 200 }}
          />
          <InputSwitch
            checked={selectionLocked}
            onChange={() => setSelectionLocked(!selectionLocked)}
            style={{ width: 40, marginLeft: 10 }}
          />
          Lock selection
        </Toolbar>
        <TablePanel loading={loading}>
          <ContextMenu model={contextMenuModel} ref={contextMenuRef} />
          <TreeTable
            responsive="true"
            scrollable
            scrollHeight="100%"
            value={treeData}
            resizableColumns
            columnResizeMode="expand"
            expandedKeys={expandedFolders}
            onToggle={onToggle}
            selectionMode="multiple"
            selectionKeys={currentSelection}
            onSelectionChange={onSelectionChange}
            onRowClick={onRowClick}
            rowClassName={(rowData) => {
              return {
                changed: rowData.key in changes || rowData.key?.startsWith('newnode'),
                deleted: rowData.key in changes && changes[rowData.key]?.__action == 'delete',
              }
            }}
            selectOnEdit={false}
            onContextMenu={(e) => contextMenuRef.current.show(e.originalEvent)}
            onContextMenuSelectionChange={onContextMenuSelectionChange}
            onColumnResizeEnd={setColumnWidths}
            reorderableColumns
            onColReorder={handleColumnReorder}
            rows={20}
          >
            {allColumns}
            <Column
              field="error"
              header=""
              body={(rowData) => formatError(rowData.data)}
              style={{ width: 24 }}
            />
          </TreeTable>
        </TablePanel>
      </Section>
    </main>
  )
}

export default EditorPage
