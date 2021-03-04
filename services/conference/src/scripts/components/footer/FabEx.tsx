import {FabColor, IconColor, MoreButton, moreButtonControl, MoreButtonMember} from '@components/utils/MoreButton'
import {Tooltip} from '@material-ui/core'
import Fab from '@material-ui/core/Fab'
import {makeStyles} from '@material-ui/core/styles'
import React, {useRef, useState} from 'react'

const useStyles = makeStyles((theme) => {
  return ({
    container: {
      margin: theme.spacing(2),
      pointerEvents: 'auto',
    },
  })
})
interface MyFabProps{
  children: React.ReactElement,
  onClick?: (e: React.MouseEvent<HTMLButtonElement, MouseEvent>|React.TouchEvent<HTMLButtonElement>) => void,
  onClickMore?: (e: React.PointerEvent<HTMLButtonElement>
    |React.MouseEvent<HTMLButtonElement, MouseEvent>|React.TouchEvent<HTMLButtonElement>) => void,
  color?: FabColor
  iconColor?: IconColor
  htmlColor?: string
  className?: string
  title?: string | React.ReactElement,
  size?: number,
}


export const FabMain: React.FC<MyFabProps> = (props) => {
  const classes = useStyles()
  const [showMore, setShowMore] = useState<boolean>(false)
  const memberRef = useRef<MoreButtonMember>({timeout:undefined})
  const member = memberRef.current

  return <span className={classes.container + (props.className ? ` ${props.className}` : '')}
    {...moreButtonControl(setShowMore, member)}
  >
    <Fab style={{height:props.size, width:props.size}}
      onClick = {(ev) => { if (props.onClick) { props.onClick(ev) } } }
      onContextMenu={(ev) => {
        ev.preventDefault()
        if (props.onClickMore) { props.onClickMore(ev) }
      }}
      color = {props.color} onFocus = {(e) => { (e.target as HTMLElement)?.blur() }}>
      {props.children}
    </Fab>
    {props.onClickMore ? <MoreButton style={{position:'relative', top:-35, left:-15, marginRight:-41}}
    show={showMore} color={props.color} htmlColor={props.htmlColor} iconColor={props.iconColor}
    onClickMore = {props.onClickMore}
    /> : undefined}
  </span>
}

export const FabWithTooltip: React.FC<MyFabProps> = (props) => {
  if (props.title) {
    return <Tooltip placement="top-start" arrow={true}
    title={props.title}>
    <span style={{paddingTop:20}} >
      <FabMain {...props} />
    </span>
    </Tooltip>
  }

  return <FabMain {...props} />
}
