import MyProfilePanel from '@/components/profile/MyProfilePanel'
import { replaceRoute } from '@/lib/rootNavigation'

const MyProfileScreen = () => {
  return (
    <MyProfilePanel onClose={() => replaceRoute('(main)', 'home')} />
  )
}

export default MyProfileScreen
