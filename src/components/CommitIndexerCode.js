import React, { useCallback, useEffect, useState } from "react";
import {
  asyncCommit,
  prepareCommit,
  requestPermissionAndCommit,
} from "../data/commitData";
import { computeWritePermission, displayNear, Loading } from "../data/utils";
import Modal from "react-bootstrap/Modal";
import { Markdown } from "./Markdown";
import { StorageCostPerByte, useNear } from "../data/near";
import { ToggleButton, ToggleButtonGroup } from "react-bootstrap";
import { useCache } from "../data/cache";
import { useAccountId } from "../data/account";

const jsonMarkdown = (data) => {
  const json = JSON.stringify(data, null, 2);
  return `\`\`\`json
${json}
\`\`\``;
};

const StorageDomain = {
  page: "commit",
};

export const CommitModal = (props) => {
  const near = useNear();
  const accountId = useAccountId();
  const cache = useCache();

  const [asyncCommitStarted, setAsyncAsyncCommitStarted] = useState(false);
  const [extraStorage, setExtraStorage] = useState(0);
  const [commitInProgress, setCommitInProgress] = useState(false);

  const [lastData, setLastData] = useState(null);
  const [commit, setCommit] = useState(null);

  const showIntent = props.show;
  const onHide = props.onHide;
  const onCancel = () => {
    if (props.onCancel) {
      try {
        props.onCancel();
      } catch (e) {
        console.error(e);
      }
    }
    onHide();
  };
  const data = props.data;
  const force = props.force;

  useEffect(() => {
    if (commitInProgress || !showIntent || !accountId || !near) {
      return;
    }
    const jdata = JSON.stringify(data ?? null);
    if (!force && jdata === lastData) {
      return;
    }
    setLastData(jdata);
    setCommit(null);
    prepareCommit(near, data, force).then(setCommit);
  }, [commitInProgress, data, lastData, force, near, accountId, showIntent]);

  const onCommit = async () => {
    setCommitInProgress(true);

    const deposit = commit.deposit.add(StorageCostPerByte.mul(extraStorage));
    await asyncCommit(near, commit.data, deposit);

    setCommit(null);
    setLastData(null);
    if (props.onCommit) {
      try {
        props.onCommit(commit.data);
      } catch (e) {
        console.error(e);
      }
    }
    cache.invalidateCache(commit.data);
    onHide();
    setCommitInProgress(false);
  };

  if (
    !commitInProgress &&
    !asyncCommitStarted &&
    commit &&
    showIntent &&
    commit.data
  ) {

    setAsyncAsyncCommitStarted(true);
    onCommit().then(() => setAsyncAsyncCommitStarted(false));

  }


  const show =
    !!commit && showIntent && !asyncCommitStarted

  return (
    <Modal size="xl" centered scrollable show={show} onHide={onCancel}>
      <Modal.Header closeButton>
        <Modal.Title>Saving Indexer Code</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {commit ? (
          <div>
            <div>
              {commit.data ? (
                <Markdown text={jsonMarkdown(commit.data)} />
              ) : (
                <h5>No new data to save</h5>
              )}
            </div>
            {commit.data && commit?.deposit?.gt(0) && (
              <div>
                <h6>
                  Required storage deposit{" "}
                  <small className="text-secondary">
                    (can be recovered later)
                  </small>
                </h6>
                <div className="mb-2">
                  {commit.deposit.div(StorageCostPerByte).toFixed(0)} bytes ={" "}
                  {displayNear(commit.deposit)}
                </div>
                <h6>
                  Optional storage deposit{" "}
                  <small className="text-secondary">
                    (can be used to avoid future wallet TX confirmation)
                  </small>
                </h6>
                <div>
                  <ToggleButtonGroup
                    type="radio"
                    name="storageDeposit"
                    value={extraStorage}
                    onChange={setExtraStorage}
                    disabled={commitInProgress}
                  >
                    <ToggleButton
                      id="esd-0"
                      variant="outline-success"
                      value={0}
                    >
                      No Deposit
                    </ToggleButton>
                    <ToggleButton
                      id="esd-5000"
                      variant="outline-success"
                      value={5000}
                    >
                      0.05 NEAR (5Kb)
                    </ToggleButton>
                    <ToggleButton
                      id="esd-20000"
                      variant="outline-success"
                      value={20000}
                    >
                      0.2 NEAR (20Kb)
                    </ToggleButton>
                    <ToggleButton
                      id="esd-100000"
                      variant="outline-success"
                      value={100000}
                    >
                      1 NEAR (100Kb)
                    </ToggleButton>
                  </ToggleButtonGroup>
                </div>
              </div>
            )}
            {widgetSrc && commit.data && (
              <div className="form-check form-switch">
                <input
                  className="form-check-input"
                  type="checkbox"
                  role="switch"
                  id="dont-ask-for-widget"
                  checked={giveWritePermission}
                  onChange={(e) => {
                    setGiveWritePermission(e.target.checked);
                  }}
                />
                <label
                  className="form-check-label"
                  htmlFor="dont-ask-for-widget"
                >
                  Don't ask again for saving similar data by{" "}
                  <span className="font-monospace">{widgetSrc}</span>
                </label>
              </div>
            )}
          </div>
        ) : (
          Loading
        )}
      </Modal.Body>
      <Modal.Footer>
        <button
          className="btn btn-success"
          disabled={!commit?.data || commitInProgress}
          onClick={(e) => {
            e.preventDefault();
            onCommit();
          }}
        >
          {commitInProgress && Loading} Save Indexer Code
        </button>
        <button
          className="btn btn-secondary"
          onClick={onCancel}
          disabled={commitInProgress}
        >
          Close
        </button>
      </Modal.Footer>
    </Modal>
  );
};

export const CommitIndexerButton = (props) => {
  const accountId = useAccountId();

  const {
    data,
    children,
    onClick,
    onCommit,
    onCancel,
    disabled,
    widgetSrc,
    force,
    ...rest
  } = props;

  const [computedData, setComputedData] = useState(null);

  return (
    <>
      <button
        {...rest}
        disabled={disabled || !data || !!computedData || !accountId}
        onClick={(e) => {
          e.preventDefault();
          setComputedData(typeof data === "function" ? data() : data);
          if (onClick) {
            onClick();
          }
        }}
      >
        {!!computedData && Loading}
        {children}
      </button>
      <CommitModal
        show={!!computedData}
        widgetSrc={widgetSrc}
        data={computedData}
        force={force}
        onHide={() => setComputedData(null)}
        onCancel={onCancel}
        onCommit={onCommit}
      />
    </>
  );
};
