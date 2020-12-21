import {connection} from '@models/api/Connection'
import {SharedContent as ISharedContent} from '@models/SharedContent'
import {default as participantsStore} from '@stores/participants/Participants'
import {ParticipantStorePlugin} from '@stores/participants/plugins/utils'
import {EventEmitter} from 'events'
import _ from 'lodash'
import {action, autorun, computed, observable} from 'mobx'
import {syncBuiltinESMExports} from 'module'
import {createContent, disposeContent} from './SharedContentCreator'
import {SharedContentTracks} from './SharedContentTracks'

export const CONTENTLOG = false      // show manipulations and sharing of content
export const contentLog = CONTENTLOG ? console.log : (a:any) => {}
export const contentDebug = CONTENTLOG ? console.debug : (a:any) => {}


function contentComp(a:ISharedContent, b:ISharedContent) {
  return a.zorder - b.zorder
}

export class ParticipantContents{
  constructor(pid: string) {
    this.participantId = pid
  }
  contentIdCounter = 0
  participantId = ''
  @observable.shallow myContents = new Map<string, ISharedContent>()
//  @observable.shallow updateRequest = new Map<string, ISharedContent>()
//  @observable.shallow removeRequest = new Set<string>()
}

export class SharedContents extends EventEmitter {
  private localId = ''
  constructor() {
    super()
    autorun(() => {
      //  sync localId to participantsStore
      const newLocalId = participantsStore.localId
      Array.from(this.owner.keys()).forEach((key) => {
        if (this.owner.get(key) === this.localId) {
          this.owner.set(key, newLocalId)
        }
      })
      const local = this.participants.get(this.localId)
      if (local) {
        this.participants.delete(this.localId)
        local.participantId = newLocalId
        this.participants.set(newLocalId, local)
      }
      this.localId = newLocalId
      contentLog(`Set new local id ${this.localId}`)
    })
    //  remove leaving participants
    autorun(() => {
      this.leavingParticipants.forEach((pc) => {
        if (pc.myContents.size === 0) {
          this.removeParticipant(pc.participantId)
        }
      })
    })
  }
  tracks = new SharedContentTracks(this)

  @observable pasteEnabled = true

  // -----------------------------------------------------------------
  //  Contents
  //  All shared contents in Z order. Observed by component.
  @observable.shallow all: ISharedContent[] = []
  //  contents by owner
  participants: Map < string, ParticipantContents > = new Map<string, ParticipantContents>()
  leavingParticipants: Map < string, ParticipantContents > = new Map<string, ParticipantContents>()
  getParticipant(pid: string) {
    //  prepare participantContents
    let participant = this.participants.get(pid)
    if (!participant) {
      participant = new ParticipantContents(pid)
      this.participants.set(pid, participant)
    }

    return participant
  }

  //  pasted content
  @observable.ref pasted:ISharedContent = createContent()
  @action setPasted(c:ISharedContent) {
    console.log('setPasted:', c)
    this.pasted = c
  }
  @action sharePasted() {
    this.shareContent(this.pasted)
    this.pasted = createContent()
  }
  //  share content
  @action shareContent(content:ISharedContent) {
    content.moveToTop()
    this.addLocalContent(content)
  }

  @computed get localParticipant(): ParticipantContents {
    return this.getParticipant(this.localId)
  }

  //  Map<cid, pid>, map from contentId to participantId
  owner: Map<string, string> = new Map<string, string>()

  public find(contentId: string) {
    const pid = this.owner.get(contentId)
    if (pid) {
      return this.participants.get(pid)?.myContents.get(contentId)
    }

    return undefined
  }

  private updateAll() {
    const newAll:ISharedContent[] = []
    this.participants.forEach((participant) => {
      newAll.push(... participant.myContents.values())
    })
    newAll.sort(contentComp)
    this.all = newAll
    //  console.log('update all len=', this.all.length, ' all=', JSON.stringify(this.all))
  }

  //  add
  addLocalContent(c:ISharedContent) {
    if (!participantsStore.localId) {
      console.error('addLocalContant() failed. Invalid Participant ID.')

      return
    }
    if (!c.id) { c.id = this.getUniqueId() }
    this.localParticipant.myContents.set(c.id, c)
    this.owner.set(c.id, participantsStore.localId)
    //  console.log('addLocalConent', c)
    this.updateAll()
  }

  private checkAndGetContent(cid: string, callBy?:string) {
    const pid = this.owner.get(cid)
    if (pid) {
      const pc = pid ? this.participants.get(pid) : undefined
      if (!pc) {
        console.error(`${callBy}: Owner does not have cid=${cid}`)
      }

      return {pid, pc}
    }
    console.error(`${callBy}: No owner for cid=${cid}`)

    return {pid, pc:undefined}
  }
  //  updated by local user
  updateByLocal(newContent: ISharedContent) {
    const {pid, pc} = this.checkAndGetContent(newContent.id, 'updateByLocal')
    if (pc) {
      if (pid === this.localId) {
        if (pc.myContents.has(newContent.id)) {
          if (this.owner.get(newContent.id) !== pid) {
            console.error(`updateByLocal: content owner not matched for ${newContent.id} owner=${this.owner.get(newContent.id)} pid=${pid}.`)
          }
        }else {
          this.owner.set(newContent.id, participantsStore.localId)
        }
        pc.myContents.set(newContent.id, newContent)
        this.updateAll()
      }else if (pid) {
        connection.conference.sync.sendContentUpdateRequest(pid, newContent)
      }
    }
  }
  //  removed by local user
  removeByLocal(cid: string) {
    const {pid, pc} = this.checkAndGetContent(cid, 'removeByLocal')
    if (pc) {
      if (pid === this.localId) {
        const toRemove = pc.myContents.get(cid)
        if (toRemove) {
          disposeContent(toRemove)
          pc.myContents.delete(cid)
          this.owner.delete(cid)
          this.updateAll()
        }else {
          console.log(`Failed to find myContent ${cid} to remove.`)
        }
      }else if (pid) {
        connection.conference.sync.sendContentRemoveRequest(pid, cid)
      }
    }
  }
  //  Update request from remote.
  updateByRemoteRequest(c: ISharedContent) {
    const pid = this.owner.get(c.id)
    if (pid === this.localId) {
      this.updateByLocal(c)
    }else {
      console.error(`This update request is for ${pid} and not for me.`)
    }
  }
  //  Remove request from remote.
  removeByRemoteRequest(cid: string) {
    const {pid, pc} = this.checkAndGetContent(cid, 'removeByRemoteRequest')
    if (pc) {
      if (pid === this.localId) {
        this.removeByLocal(cid)
      }else {
        console.error('remote try to remove my content')
      }
    }
  }

  //  Update remote contents by remote.
  updateRemoteContents(cs: ISharedContent[], pid:string) {
    if (pid === contents.localId) {
      console.error('Remote updates local contents.')
    }
    cs.forEach((c) => {
      const participant = this.getParticipant(pid)
      contentLog(`updateContents for participant:${pid}`)
      contentDebug(` update ${c.id} by ${c}`)
      contentDebug(' myContents=', JSON.stringify(participant?.myContents))

      if (participant.myContents.has(c.id)) {
        const owner = this.owner.get(c.id)
        if (owner !== pid) {
          console.error(`Owner not match for cid=${c.id} owner=${owner} pid=${pid}.`)
        }
      }else {
        this.owner.set(c.id, pid)
      }
      participant.myContents.set(c.id, c)
    })
    this.updateAll()
  }
  //  Remove remote contents by remote.
  removeRemoteContents(cids: string[], pid:string) {
    if (pid === contents.localId) {
      console.error('Remote removes local contents.')
    }
    const pc = this.getParticipant(pid)
    cids.forEach((cid) => {
      const c = pc.myContents.get(cid)
      if (c) {
        pc.myContents.delete(cid)
        this.owner.delete(cid)
        disposeContent(c)
      }else {
        console.error(`removeByRemote: failed to find content cid=${cid}`)
      }
    })
    this.updateAll()
  }

  //  If I'm the next, obtain the contents
  onParticipantLeft(pidLeave:string) {
    contentLog('onParticipantLeft called with pid = ', pidLeave)
    const participantLeave = this.participants.get(pidLeave)
    if (participantLeave) {
      const allPids = Array.from(participantsStore.remote.keys())
      allPids.push(this.localId)
      allPids.sort()
      const idx = allPids.findIndex(cur => cur > pidLeave)
      const next = allPids[idx >= 0 ? idx : 0]
      contentLog('next = ', next)
      if (next === this.localId) {
        contentLog('Next is me')
        const myContents = new Map<string, ISharedContent>(this.localParticipant.myContents)
        participantLeave.myContents.forEach((c, cid) => {
          myContents.set(cid, c)
          this.owner.set(cid, this.localId)
          contentLog('set owner for cid=', cid, ' pid=', this.localId)
        })
        this.removeParticipant(pidLeave)
        contentLog('remove:', pidLeave, ' current:', JSON.stringify(allPids))
        contentLog('local contents sz:', myContents.size, ' json:', JSON.stringify(Array.from(myContents.keys())))
        this.localParticipant.myContents = myContents
        this.updateAll()
      }else {
        contentLog('Next is remote')
        this.leavingParticipants.set(pidLeave, participantLeave)
      }
    }
  }

  private removeParticipant(pid:string) {
    const participant = this.participants.get(pid)
    if (participant) {
      this.participants.delete(pid)
      //  myContents will move to another participant and owner will be overwrite. So, no change on owner.
    }
  }

  // create a new unique content id
  getUniqueId() {
    const pid = participantsStore.localId
    if (!this.participants.has(pid)) {
      this.participants.set(pid, new ParticipantContents(pid))
    }
    const participant = this.participants.get(pid)
    if (participant) {
      while (1) {
        participant.contentIdCounter += 1
        const id = `${participant.participantId}_${participant.contentIdCounter}`
        if (!this.owner.has(id)) {
          return id
        }
      }
    }
    console.error('Error in getUniqueId()')

    return ''
  }
}

const contents = new SharedContents()
declare const d:any
d.contents = contents
export default contents
