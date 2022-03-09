import { useEffect, useState, useMemo } from 'react'
import { useFetch } from 'use-http'
import { useSelector } from 'react-redux'
import { toast } from 'react-toastify'

import ProjectWrapper from '../containers/project-wrapper'
import { Shade } from '../components'

import { Button } from 'primereact/button'
import { TreeTable } from 'primereact/treetable'
import { Column } from 'primereact/column'
import { InputText } from 'primereact/inputtext'
import { InputNumber } from 'primereact/inputnumber'

const FOLDERS_QUERY = `
    query FolderTree($projectName: String!, $parent: String!) {
        project(name: $projectName) {
            folders(parentId: $parent) {
                edges {
                    node {
                        id
                        name
                        hasChildren
                        childrenCount
                        attrib {
                            #ATTRS#
                        }
                    }
                }
            }
        }
    }
`

const buildQuery = (baseQuery, settings, scope) => {
  let attribs = ""
  for (const attrib of settings.attributes){
    if (attrib.scope.includes("folder"))
      attribs += `${attrib.name}\n`
  }
  return baseQuery.replace("#ATTRS#", attribs)
}

const textEditor = (options) => {
  return <InputText 
    type="text" 
    value={options.value} 
    onChange={(e) => options.editorCallback(e.target.value)} 
  />
}

const numberEditor = (options) => {
  //console.log(options)
  //  onChange={(e) => options.editorCallback(e.value)} 
  return <InputNumber 
    showButtons={true}
    value={options.value} 
    onChange={(e)=>{console.log(e)}}
  />
}


const ManagerPage = () => {
  const context = useSelector((state) => ({ ...state.contextReducer }))
  const settings = useSelector((state) => ({ ...state.settingsReducer }))
  const projectName = context.projectName
  const [hierarchy, setHierarchy] = useState([])
  const [request, response, loading] = useFetch('/graphql')


  const columns = useMemo(() => {
    let cols = []
    for (const attrib of settings.attributes){
      if (attrib.scope.includes("folder"))
        cols.push({
          name: attrib.name,
          title: attrib.title,
          isAttrib: true
        })
    }
    console.log("COLS", cols)
    return cols
  }, [])


  const loadHierarchy = async (parent, path = null) => {
    let nodes = []
    const params = { projectName, parent }
    const pathArr = path ? path : []
    const query = buildQuery(FOLDERS_QUERY, settings, "folder")
    const data = await request.query(query, params)
    if (!response.ok) {
      toast.error('Unable to load hierarchy')
    }

    for (const edge of data.data.project.folders.edges) {
      const node = edge.node
      nodes.push({
        data: node,
        key: node.id,
        leaf: !node.hasChildren,
        children: [],
        path: [...pathArr, node.id],
      })
    }

    if (parent === 'root') {
      setHierarchy(nodes)
      return
    }

    // TODO: try to do this in one pass
    let result = [...hierarchy]
    const updateHierarchy = (src) => {
      for (let node of src || result) {
        if (node.data.id === parent) {
          node.children = nodes
          return
        } else {
          if (node.children) {
            updateHierarchy(node.children)
          }
        }
      }
    }
    updateHierarchy()
    setHierarchy(result)
  }

  useEffect(() => {
    if (!projectName) return
    loadHierarchy('root')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectName])

  const onExpand = (event) => {
    // if (event.node.children.length)
    //    return
    loadHierarchy(event.node.key, event.node.path)
  }

  return (
    <ProjectWrapper>
      <main className="rows">
        <section className="invisible row">
          <Button icon="pi pi-plus" label="This" disabled />
          <Button icon="pi pi-plus" label="is" disabled />
          <Button icon="pi pi-plus" label="a" disabled />
          <Button icon="pi pi-plus" label="mockup" disabled />
          <Button icon="pi pi-plus" label="toolbar" disabled />
          <div style={{ flexGrow: 1 }} />
        </section>
        <section className="column" style={{ flexGrow: 1 }}>
          {loading && <Shade />}
          <div className="wrapper">
          <TreeTable
            responsive
            scrollable
            scrollHeight="100%"
            value={hierarchy}
            onExpand={onExpand}

            resizableColumns
            columnResizeMode="expand"
            scrollDirection="both"
          >
            <Column 
              field="name" 
              header="Name"     
              expander
              style={{ width: 200}}
            />

            { columns.map((col) => {

              return (
                <Column 
                  key={col.name} 
                  header={col.title}
                  field={`attrib.${col.name}`}
                  style={{ width: 100}}
                  body={(row) => {return row.data.attrib[col.name]}}
                  editor={(options) => numberEditor(options)} 
                />
              )

            })}
          </TreeTable>
          </div>
        </section>
      </main>
    </ProjectWrapper>
  )
}

export default ManagerPage
