import {
  defaultInformation, defaultPhysics,
  Information, Mouse, ParticipantBase as IParticipantBase, Physics, Tracks,
} from '@models/Participant'
import {MapObject} from '@stores/MapObject'
import {JitsiTrack} from 'lib-jitsi-meet'
import {action, computed, makeObservable, observable} from 'mobx'
import {getRandomColor, getRandomColorRGB, shallowObservable, Store} from '../utils'
import {Plugins} from './plugins'

export class TracksStore<T extends JitsiTrack> implements Tracks{
  constructor(){
    makeObservable(this)
  }
  @observable.ref audio:T|undefined = undefined
  @observable audioLevel = 0
  @observable.ref avatar:T|undefined = undefined
  @observable avatarOk = this.avatar ? !this.avatar.getTrack().muted : true
  @computed get audioStream() { return this.audio?.getOriginalStream() }
  @computed get avatarStream() { return this.avatarOk ? this.avatar?.getOriginalStream() : undefined }
  @action onMuteChanged(track: JitsiTrack, mute: boolean) {
    if (track === this.avatar) {
      this.avatarOk = !mute
    }
  }
  @action setAudioLevel(newLevel: number) {
    this.audioLevel = newLevel
  }
}


export class ParticipantBase extends MapObject implements Store<IParticipantBase> {
  @observable id = ''
  information = shallowObservable<Information>(defaultInformation)
  plugins: Plugins
  tracks = shallowObservable<TracksStore<JitsiTrack>>(new TracksStore<JitsiTrack>())
  physics = shallowObservable<Physics>(defaultPhysics)
  mouse = shallowObservable<Mouse>({position:[0, 0], show:false})

  constructor() {
    super()
    makeObservable(this)
    this.plugins = new Plugins(this)
  }

  getColor() {
    return getRandomColor(this.information.name)
  }
  getColorRGB() {
    return getRandomColorRGB(this.information.name)
  }

  @action.bound
  setInformation(info: Information) {
    Object.assign(this.information, info)
    //  console.log('setInformation called')
  }
  @action.bound
  setPhysics(physics: Partial<Physics>) {
    Object.assign(this.physics, physics)
  }
}

