import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Widget } from "../components/Widget/Widget";
import ls from "local-storage";
import { LsKey, NearConfig, useNear } from "../data/near";
import prettier from "prettier";
import parserBabel from "prettier/parser-babel";
import { useHistory, useParams } from "react-router-dom";
import Editor from "@monaco-editor/react";
import { useCache } from "../data/cache";
import { CommitButton } from "../components/Commit";
import { Nav, OverlayTrigger, Tooltip } from "react-bootstrap";
import RenameModal from "../components/Editor/RenameModal";
import OpenModal from "../components/Editor/OpenModal";
import { useAccountId } from "../data/account";
import { CommitIndexerButton } from '../components/CommitIndexerCode'
import { Near } from "near-api-js";
const StorageDomain = {
  page: "editor",
};
const IndexerStorageDomain = {
  editor: "indexer",
};
const StorageType = {
  Code: "code",
  IndexerCode: "indexerCode",
  Files: "files",
};

const Filetype = {
  Widget: "widget",
  Module: "module",
};

const EditorLayoutKey = LsKey + "editorLayout:";
const WidgetPropsKey = LsKey + "widgetProps:";

const DefaultEditorCode = "return <div>Hello World</div>;";

const DefaultIndexerCode = ``;

const Tab = {
  Editor: "Editor",
  Props: "Props",
  Metadata: "Metadata",
  Widget: "Widget",
  Indexer: "Indexer",
};

const Layout = {
  Tabs: "Tabs",
  Split: "Split",
};
// const ComponentWithGraphQLData = () => {
//   const { loading, error, data } = useQuery(gql`
//   {
//     user(id: 1) {
//       id
//       name
//     }
//   }`)

//   if (loading) return <p>Loading...</p>
//   if (error) return <p>Error!</p>
//   console.log(data.myData, "mydata")
//   return <p>{data.myData}</p>
// }
export default function EditorPage(props) {
  const { widgetSrc } = useParams();
  const history = useHistory();
  const setWidgetSrc = props.setWidgetSrc;

  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState(undefined);
  const [indexerCode, setIndexerCode] = useState(undefined);
  const [path, setPath] = useState(undefined);
  const [files, setFiles] = useState(undefined);
  const [lastPath, setLastPath] = useState(undefined);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showOpenModal, setShowOpenModal] = useState(false);

  const [renderCode, setRenderCode] = useState(code);
  const [widgetProps, setWidgetProps] = useState(
    ls.get(WidgetPropsKey) || "{}"
  );
  const [parsedWidgetProps, setParsedWidgetProps] = useState({});
  const [propsError, setPropsError] = useState(null);
  const [metadata, setMetadata] = useState(undefined);
  const near = useNear();
  const cache = useCache();
  const accountId = useAccountId();

  const [tab, setTab] = useState(Tab.Editor);
  const [layout, setLayoutState] = useState(
    ls.get(EditorLayoutKey) || Layout.Tabs
  );

  const setLayout = useCallback(
    (layout) => {
      ls.set(EditorLayoutKey, layout);
      setLayoutState(layout);
    },
    [setLayoutState]
  );

  useEffect(() => {
    setWidgetSrc({
      edit: null,
      view: widgetSrc,
    });
  }, [widgetSrc, setWidgetSrc]);

  const updateCode = useCallback(
    (path, code) => {
      cache.localStorageSet(
        StorageDomain,
        {
          path,
          type: StorageType.Code,
        },
        {
          code,
          time: Date.now(),
        }
      );
      setCode(code);
    },
    [cache, setCode]
  );

  const updateIndexerCode = useCallback(
    (path, indexerCode) => {
      cache.localStorageSet(
        IndexerStorageDomain,
        {
          path,
          type: StorageType.IndexerCode,
        },
        {
          indexerCode,
          time: Date.now(),
        }
      );
      setIndexerCode(indexerCode);
    },
    [cache, setIndexerCode]
  );

  useEffect(() => {
    ls.set(WidgetPropsKey, widgetProps);
    try {
      const parsedWidgetProps = JSON.parse(widgetProps);
      setParsedWidgetProps(parsedWidgetProps);
      setPropsError(null);
    } catch (e) {
      setParsedWidgetProps({});
      setPropsError(e.message);
    }
  }, [widgetProps]);

  const removeFromFiles = useCallback(
    (path) => {
      path = JSON.stringify(path);
      setFiles((files) =>
        files.filter((file) => JSON.stringify(file) !== path)
      );
      setLastPath(path);
    },
    [setFiles, setLastPath]
  );

  const addToFiles = useCallback(
    (path) => {
      const jpath = JSON.stringify(path);
      setFiles((files) => {
        const newFiles = [...files];
        if (!files.find((file) => JSON.stringify(file) === jpath)) {
          newFiles.push(path);
        }
        return newFiles;
      });
      setLastPath(path);
    },
    [setFiles, setLastPath]
  );

  useEffect(() => {
    if (files && lastPath) {
      cache.localStorageSet(
        StorageDomain,
        {
          type: StorageType.Files,
        },
        { files, lastPath }
      );
    }
  }, [files, lastPath, cache]);

  const openFile = useCallback(
    (path, code, indexerCode) => {
      setPath(path);
      addToFiles(path);
      setMetadata(undefined);
      setRenderCode(null);
      if (code !== undefined) {
        updateCode(path, code);
      } else {
        setLoading(true);
        cache
          .asyncLocalStorageGet(StorageDomain, {
            path,
            type: StorageType.Code,
          })
          .then(({ code }) => {
            updateCode(path, code);
          })
          .finally(() => {
            setLoading(false);
          });
      }
      if (indexerCode !== undefined) {
        updateIndexerCode(path, indexerCode);
      } else {
        setLoading(true);
        cache
          .asyncLocalStorageGet(IndexerStorageDomain, {
            path,
            type: StorageType.IndexerCode,
          })
          .then(({ code }) => {
            updateIndexerCode(path, code);
          })
          .finally(() => {
            setLoading(false);
          });
      }
    },
    [updateCode, updateIndexerCode, addToFiles]
  );

  const toPath = useCallback((type, nameOrPath) => {
    const name =
      nameOrPath.indexOf("/") >= 0
        ? nameOrPath.split("/").slice(2).join("/")
        : nameOrPath;
    return { type, name };
  }, []);

  const loadFile = useCallback(
    (nameOrPath) => {
      if (!near) {
        return;
      }
      const widgetSrc =
        nameOrPath.indexOf("/") >= 0
          ? nameOrPath
          : `${accountId}/widget/${nameOrPath}`;
      const c = () => {
        const code = cache.socialGet(
          near,
          widgetSrc,
          false,
          undefined,
          undefined,
          c
        );
        const indexerCode = cache.cachedViewCall(near, "registry.queryapi.near", "read_indexer_function", {
          name: `${accountId}/${nameOrPath}`,
        })
        if (code) {
          const name = widgetSrc.split("/").slice(2).join("/");
          openFile(toPath(Filetype.Widget, widgetSrc), code, indexerCode);
        }


      };

      c();
    },
    [accountId, openFile, toPath, near, cache]
  );

  const generateNewName = useCallback(
    (type) => {
      for (let i = 0; ; i++) {
        const name = `Draft-${i}`;
        const path = toPath(type, name);
        path.unnamed = true;
        const jPath = JSON.stringify(path);
        if (!files?.find((file) => JSON.stringify(file) === jPath)) {
          return path;
        }
      }
    },
    [toPath, files]
  );

  const createFile = useCallback(
    (type) => {
      const path = generateNewName(type);
      openFile(path, DefaultEditorCode, DefaultIndexerCode);
    },
    [generateNewName, openFile]
  );

  const renameFile = useCallback(
    (newName, code) => {
      const newPath = toPath(path.type, newName);
      const jNewPath = JSON.stringify(newPath);
      const jPath = JSON.stringify(path);
      setFiles((files) => {
        const newFiles = files.filter(
          (file) => JSON.stringify(file) !== jNewPath
        );
        const i = newFiles.findIndex((file) => JSON.stringify(file) === jPath);
        if (i >= 0) {
          newFiles[i] = newPath;
        }
        return newFiles;
      });
      setLastPath(newPath);
      setPath(newPath);
      updateCode(newPath, code);
    },
    [path, toPath, updateCode]
  );

  useEffect(() => {
    cache
      .asyncLocalStorageGet(StorageDomain, { type: StorageType.Files })
      .then((value) => {
        const { files, lastPath } = value || {};
        setFiles(files || []);
        setLastPath(lastPath);
      });
  }, [cache]);

  useEffect(() => {
    if (!near || !files) {
      return;
    }
    if (widgetSrc) {
      if (widgetSrc === "new") {
        createFile(Filetype.Widget);
      } else {
        loadFile(widgetSrc);
      }
      analytics("edit", {
        props: {
          widget: widgetSrc,
        },
      });
      history.replace(`/edit/`);
    } else if (path === undefined) {
      if (files.length === 0) {
        createFile(Filetype.Widget);
      } else {
        openFile(lastPath, undefined, undefined);
      }
    }
  }, [near, createFile, lastPath, files, path, widgetSrc, openFile, loadFile]);

  const reformat = useCallback(
    (path, code, updateCodeFunc) => {
      try {
        const formattedCode = prettier.format(code, {
          parser: "babel",
          plugins: [parserBabel],
        });
        updateCodeFunc(path, formattedCode);
      } catch (e) {
        console.log(e);
      }
    },
    []
  );

  const reformatProps = useCallback(
    (props) => {
      try {
        const formattedProps = JSON.stringify(JSON.parse(props), null, 2);
        setWidgetProps(formattedProps);
      } catch (e) {
        console.log(e);
      }
    },
    [setWidgetProps]
  );

  const layoutClass = layout === Layout.Split ? "col-lg-6" : "";

  const onLayoutChange = useCallback(
    (e) => {
      const layout = e.target.value;
      if (layout === Layout.Split && tab === Tab.Widget) {
        setTab(Tab.Editor);
      }
      setLayout(layout);
    },
    [setLayout, tab, setTab]
  );

  const widgetName = path?.name;

  const commitButton = (
    <CommitButton
      className="btn btn-primary"
      disabled={!widgetName}
      near={near}
      data={{
        widget: {
          [widgetName]: {
            "": code,
            metadata,
          },
        },
      }}
    >
      Save Widget
    </CommitButton>
  );

  const commitIndexerCodeButton = (
    <CommitIndexerButton
      className="btn btn-primary"
      disabled={!widgetName}
      near={near}
      data={{
        widgetName: {
          "": indexerCode,
        },
      }}
    >
      Save Indexer Code
    </CommitIndexerButton>
  );

  const widgetPath = `${accountId}/${path?.type}/${path?.name}`;
  const jpath = JSON.stringify(path);

  return (
    <div className="container-fluid mt-1">
      <RenameModal
        key={`rename-modal-${jpath}`}
        show={showRenameModal}
        name={path?.name}
        onRename={(newName) => renameFile(newName, code)}
        onHide={() => setShowRenameModal(false)}
      />
      <OpenModal
        show={showOpenModal}
        onOpen={(newName) => loadFile(newName)}
        onNew={(newName) =>
          newName
            ? openFile(toPath(Filetype.Widget, newName), DefaultEditorCode, DefaultIndexerCode)
            : createFile(Filetype.Widget)
        }
        onHide={() => setShowOpenModal(false)}
      />
      <div className="mb-3">
        <Nav
          variant="pills mb-1"
          activeKey={jpath}
          onSelect={(key) => openFile(JSON.parse(key))}
        >
          {files?.map((p, idx) => {
            const jp = JSON.stringify(p);
            return (
              <Nav.Item key={jp}>
                <Nav.Link className="text-decoration-none" eventKey={jp}>
                  {p.name}
                  <button
                    className={`btn btn-sm border-0 py-0 px-1 ms-1 rounded-circle ${jp === jpath
                      ? "btn-outline-light"
                      : "btn-outline-secondary"
                      }`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      removeFromFiles(p);
                      if (jp === jpath) {
                        if (files.length > 1) {
                          openFile(files[idx - 1] || files[idx + 1]);
                        } else {
                          createFile(Filetype.Widget);
                        }
                      }
                    }}
                  >
                    <i className="bi bi-x"></i>
                  </button>
                </Nav.Link>
              </Nav.Item>
            );
          })}
          <Nav.Item>
            <Nav.Link
              className="text-decoration-none"
              onClick={() => setShowOpenModal(true)}
            >
              <i className="bi bi-file-earmark-plus"></i> Add
            </Nav.Link>
          </Nav.Item>
        </Nav>
        {NearConfig.widgets.editorComponentSearch && (
          <div>
            <Widget
              src={NearConfig.widgets.editorComponentSearch}
              props={useMemo(
                () => ({
                  extraButtons: ({ widgetName, widgetPath, onHide }) => (
                    <OverlayTrigger
                      placement="auto"
                      overlay={
                        <Tooltip>
                          Open "{widgetName}" component in the editor
                        </Tooltip>
                      }
                    >
                      <button
                        className="btn btn-outline-primary"
                        onClick={(e) => {
                          e.preventDefault();
                          loadFile(widgetPath);
                          onHide && onHide();
                        }}
                      >
                        Open
                      </button>
                    </OverlayTrigger>
                  ),
                }),
                [loadFile]
              )}
            />
          </div>
        )}
      </div>
      <div className="d-flex align-content-start">
        <div className="me-2">
          <div
            className="btn-group-vertical"
            role="group"
            aria-label="Layout selection"
          >
            <input
              type="radio"
              className="btn-check"
              name="layout-radio"
              id="layout-tabs"
              autoComplete="off"
              checked={layout === Layout.Tabs}
              onChange={onLayoutChange}
              value={Layout.Tabs}
              title={"Set layout to Tabs mode"}
            />
            <label className="btn btn-outline-secondary" htmlFor="layout-tabs">
              <i className="bi bi-square" />
            </label>

            <input
              type="radio"
              className="btn-check"
              name="layout-radio"
              id="layout-split"
              autoComplete="off"
              checked={layout === Layout.Split}
              value={Layout.Split}
              title={"Set layout to Split mode"}
              onChange={onLayoutChange}
            />
            <label className="btn btn-outline-secondary" htmlFor="layout-split">
              <i className="bi bi-layout-split" />
            </label>
          </div>
        </div>
        <div className="flex-grow-1">
          <div className="row">
            <div className={layoutClass}>
              <ul className={`nav nav-tabs mb-2`}>
                <li className="nav-item">
                  <button
                    className={`nav-link ${tab === Tab.Editor ? "active" : ""}`}
                    aria-current="page"
                    onClick={() => setTab(Tab.Editor)}
                  >
                    Editor
                  </button>
                </li>
                <li className="nav-item">
                  <button
                    className={`nav-link ${tab === Tab.Props ? "active" : ""}`}
                    aria-current="page"
                    onClick={() => setTab(Tab.Props)}
                  >
                    Props
                  </button>
                </li>
                {NearConfig.widgets.widgetMetadataEditor && (
                  <li className="nav-item">
                    <button
                      className={`nav-link ${tab === Tab.Metadata ? "active" : ""
                        }`}
                      aria-current="page"
                      onClick={() => setTab(Tab.Metadata)}
                    >
                      Metadata
                    </button>
                  </li>
                )}
                {NearConfig.widgets.widgetMetadataEditor && (
                  <li className="nav-item">
                    <button
                      className={`nav-link ${tab === Tab.Indexer ? "active" : ""
                        }`}
                      aria-current="page"
                      onClick={() => setTab(Tab.Indexer)}
                    >
                      Data Indexing
                    </button>
                  </li>
                )}
                {layout === Layout.Tabs && (
                  <li className="nav-item">
                    <button
                      className={`nav-link ${tab === Tab.Widget ? "active" : ""
                        }`}
                      aria-current="page"
                      onClick={() => {
                        setRenderCode(code);
                        setTab(Tab.Widget);
                      }}
                    >
                      Widget Preview
                    </button>
                  </li>
                )}
              </ul>

              <div className={`${tab === Tab.Editor ? "" : "visually-hidden"}`}>
                <div className="form-control mb-3" style={{ height: "70vh" }}>
                  <Editor
                    value={code}
                    path={widgetPath}
                    defaultLanguage="javascript"
                    onChange={(code) => updateCode(path, code)}
                    wrapperProps={{
                      onBlur: () => reformat(path, code, updateCode),
                    }}
                  />
                </div>
                <div className="mb-3 d-flex gap-2 flex-wrap">
                  <button
                    className="btn btn-success"
                    onClick={() => {
                      setRenderCode(code);
                      if (layout === Layout.Tabs) {
                        setTab(Tab.Widget);
                      }
                    }}
                  >
                    Render preview
                  </button>
                  {!path?.unnamed && commitButton}
                  <button
                    className={`btn ${path?.unnamed ? "btn-primary" : "btn-secondary"
                      }`}
                    onClick={() => {
                      setShowRenameModal(true);
                    }}
                  >
                    Rename {path?.type}
                  </button>
                  {path && accountId && (
                    <a
                      className="btn btn-outline-primary"
                      href={`#/${widgetPath}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open Component in a new tab
                    </a>
                  )}
                </div>
              </div>
              <div className={`${tab === Tab.Props ? "" : "visually-hidden"}`}>
                <div className="form-control" style={{ height: "70vh" }}>
                  <Editor
                    value={widgetProps}
                    defaultLanguage="json"
                    onChange={(props) => setWidgetProps(props)}
                    wrapperProps={{
                      onBlur: () => reformatProps(widgetProps),
                    }}
                  />
                </div>
                <div className=" mb-3">^^ Props for debugging (in JSON)</div>
                {propsError && (
                  <pre className="alert alert-danger">{propsError}</pre>
                )}
              </div>
              <div
                className={`${tab === Tab.Metadata &&
                  NearConfig.widgets.widgetMetadataEditor
                  ? ""
                  : "visually-hidden"
                  }`}
              >
                <div className="mb-3">
                  <Widget
                    src={NearConfig.widgets.widgetMetadataEditor}
                    key={`metadata-editor-${jpath}`}
                    props={useMemo(
                      () => ({
                        widgetPath,
                        onChange: setMetadata,
                      }),
                      [widgetPath]
                    )}
                  />
                </div>
                <div className="mb-3">{commitButton}</div>
              </div>
            </div>
            <div
              className={`${tab === Tab.Widget ||
                (layout === Layout.Split && tab !== Tab.Metadata)
                ? layoutClass
                : "visually-hidden"
                }`}
            >
              <div className="container">
                <div className="row">
                  <div className="d-inline-block position-relative overflow-hidden">
                    {renderCode ? (
                      <Widget
                        key={`preview-${jpath}`}
                        code={renderCode}
                        props={parsedWidgetProps}
                      />
                    ) : (
                      'Click "Render preview" button to render the widget'
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div
              className={`${tab === Tab.Metadata ? layoutClass : "visually-hidden"
                }`}
            >
              <div className="container">
                <div className="row">
                  <div className="d-inline-block position-relative overflow-hidden">
                    <Widget
                      key={`metadata-${jpath}`}
                      src={NearConfig.widgets.widgetMetadata}
                      props={useMemo(
                        () => ({ metadata, accountId, widgetName }),
                        [metadata, accountId, widgetName]
                      )}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className={`${tab === Tab.Indexer ? "" : "visually-hidden"}`}>
              <div className="form-control mb-3" style={{ height: "70vh" }}>
                <Editor
                  value={indexerCode}
                  path={widgetPath}
                  defaultLanguage="javascript"
                  onChange={(indexerCode) => updateIndexerCode(path, indexerCode)}
                  wrapperProps={{
                    onBlur: () => reformat(path, indexerCode, updateIndexerCode),
                  }}
                />
              </div>
              <div className="mb-3 d-flex gap-2 flex-wrap">
                <button
                  className="btn btn-success"
                  onClick={() => {
                    setRenderIndexerCode(indexerCode);
                    if (layout === Layout.Tabs) {
                      setTab(Tab.Widget);
                    }
                  }}
                >
                  Start Indexer
                </button>
                {NearConfig.widgets.IndexerCodeCommitButton && (
                  <Widget
                    key={`indexer-commit-${jpath}`}
                    src={NearConfig.widgets.IndexerCodeCommitButton}
                    props={useMemo(
                      () => ({ indexer_name: `${accountId}/${widgetName}`, indexer_code: indexerCode }),
                      [accountId, widgetName, indexerCode]
                    )}
                  />
                )}
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
