import { Platform, View } from 'react-native';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '~/components/ui/alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '~/components/ui/context-menu';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '~/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '~/components/ui/hover-card';
import { Text } from '~/components/ui/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip';
import { Muted } from '~/components/ui/typography';
import { CalendarDays } from '@/lib/icons/CalendarDays';
import { ChevronDown } from '~/lib/icons/ChevronDown';
import { Info } from '~/lib/icons/Info';
import { cn } from '~/lib/utils';
import React from 'react';

export default function HomeScreen() {
  return (
    <View className='flex-1 p-6 justify-center gap-6'>
      <Card className='w-full max-w-lg mx-auto'>
        <CardHeader>
          <View className='flex-row gap-3'>
            <CardTitle className='pt-1'>Team Members</CardTitle>
            <Tooltip delayDuration={300}>
              <TooltipTrigger className='web:focus:outline-none'>
                <Info size={Platform.OS == 'web' ? 14 : 16} className='text-foreground' />
              </TooltipTrigger>
              <TooltipContent side='bottom' insets={contentInsets} className='gap-1 py-3 px-5'>
                <Text className='native:text-lg font-bold'>Things to try:</Text>
                <Text className='native:text-lg text-muted-foreground'>
                  · {Platform.OS === 'web' ? 'Hover' : 'Press'} the team member's name
                </Text>
                <Text className='native:text-lg text-muted-foreground'>
                  · {Platform.OS === 'web' ? 'Right click' : 'Press and hold'} the avatar
                </Text>
              </TooltipContent>
            </Tooltip>
          </View>
          <CardDescription>Invite your team members to collaborate.</CardDescription>
        </CardHeader>
        <CardContent className='gap-8'>
          <View className='flex-row gap-3'>
            <View className='flex-1 flex-row gap-3'>
              <TeamMemberAvatar
                initials='ZN'
                name='Zach Nugent'
                uri='https://github.com/mrzachnugent.png'
              />
              <View className='flex-1'>
                <TeamMemberHoverCard name='Zach Nugent' />
                <Text numberOfLines={1} className='text-muted-foreground'>
                  zachnugent@example.com
                </Text>
              </View>
            </View>
            <RoleDropdownSelect defaultValue='Billing' />
          </View>
          <View className='flex-row gap-3'>
            <View className='flex-1 flex-row gap-3'>
              <TeamMemberAvatar initials='JD' name='Jane Doe' uri='invalid link' />
              <View className='flex-1'>
                <TeamMemberHoverCard name='Jane Doe' />
                <Text numberOfLines={1} className='text-muted-foreground'>
                  jane@example.com
                </Text>
              </View>
            </View>
            <RoleDropdownSelect defaultValue='Owner' />
          </View>
        </CardContent>
      </Card>
    </View>
    // <ParallaxScrollView
    //   headerBackgroundColor={{ light: '#A1CEDC', dark: '#1D3D47' }}
    //   headerImage={
    //     <Image
    //       source={require('@/assets/images/partial-react-logo.png')}
    //       style={styles.reactLogo}
    //     />
    //   }>
    //   <ThemedView style={styles.titleContainer}>
    //     <ThemedText type="title">Welcome!</ThemedText>
    //     <HelloWave />
    //   </ThemedView>
    //   <ThemedView style={styles.stepContainer}>
    //     <ThemedText type="subtitle">Step 1: Try it</ThemedText>
    //     <ThemedText>
    //       Edit <ThemedText type="defaultSemiBold">app/(tabs)/index.tsx</ThemedText> to see changes.
    //       Press{' '}
    //       <ThemedText type="defaultSemiBold">
    //         {Platform.select({
    //           ios: 'cmd + d',
    //           android: 'cmd + m',
    //           web: 'F12',
    //         })}
    //       </ThemedText>{' '}
    //       to open developer tools.
    //     </ThemedText>
    //   </ThemedView>
    //   <ThemedView style={styles.stepContainer}>
    //     <ThemedText type="subtitle">Step 2: Explore</ThemedText>
    //     <ThemedText>
    //       {`Tap the Explore tab to learn more about what's included in this starter app.`}
    //     </ThemedText>
    //   </ThemedView>
    //   <ThemedView style={styles.stepContainer}>
    //     <ThemedText type="subtitle">Step 3: Get a fresh start</ThemedText>
    //     <ThemedText>
    //       {`When you're ready, run `}
    //       <ThemedText type="defaultSemiBold">npm run reset-project</ThemedText> to get a fresh{' '}
    //       <ThemedText type="defaultSemiBold">app</ThemedText> directory. This will move the current{' '}
    //       <ThemedText type="defaultSemiBold">app</ThemedText> to{' '}
    //       <ThemedText type="defaultSemiBold">app-example</ThemedText>.
    //     </ThemedText>
    //   </ThemedView>
    // </ParallaxScrollView>
  );
}
const contentInsets = {
  left: 12,
  right: 12,
};

function RoleDropdownSelect({ defaultValue }: { defaultValue: string }) {
  const [value, setValue] = React.useState(defaultValue);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant='outline'
          size={Platform.OS === 'web' ? 'sm' : 'default'}
          className='flex-row gap-2 native:pr-3'
        >
          <Text>{value}</Text>
          <ChevronDown size={18} className='text-foreground' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' insets={contentInsets} className='w-64 native:w-72'>
        <DropdownMenuLabel>Select new role</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup className='gap-1'>
          <DropdownMenuItem
            onPress={() => {
              setValue('Viewer');
            }}
            className={cn(
              'flex-col items-start gap-1',
              value === 'Viewer' ? 'bg-secondary/70' : ''
            )}
          >
            <Text>Viewer</Text>
            <Muted>Can view and comment.</Muted>
          </DropdownMenuItem>
          <DropdownMenuItem
            onPress={() => {
              setValue('Billing');
            }}
            className={cn(
              'flex-col items-start gap-1',
              value === 'Billing' ? 'bg-secondary/70' : ''
            )}
          >
            <Text>Billing</Text>
            <Muted>Can view, comment, and manage billing.</Muted>
          </DropdownMenuItem>
          <DropdownMenuItem
            onPress={() => {
              setValue('Owner');
            }}
            className={cn('flex-col items-start gap-1', value === 'Owner' ? 'bg-secondary/70' : '')}
          >
            <Text>Owner</Text>
            <Muted>Admin-level access to all resources</Muted>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


function TeamMemberHoverCard({ name }: { name: string }) {
  return (
    <HoverCard openDelay={0} closeDelay={0}>
      <HoverCardTrigger className='group web:focus:outline-none'>
        <Text numberOfLines={1} className='group-active:underline web:group-hover:underline'>
          {name}
        </Text>
      </HoverCardTrigger>
      <HoverCardContent insets={contentInsets} className='w-80 native:w-96'>
        <View className='flex flex-row justify-between gap-4'>
          <Avatar alt='Vercel avatar'>
            <AvatarImage source={{ uri: 'https://github.com/vercel.png' }} />
            <AvatarFallback>
              <Text>VC</Text>
            </AvatarFallback>
          </Avatar>
          <View className='gap-1 flex-1'>
            <Text className='text-sm native:text-base font-semibold'>{name}</Text>
            <Text className='text-sm native:text-base'>
              Wishes they were part of the triangle company.
            </Text>
            <View className='flex flex-row items-center pt-2 gap-2'>
              <CalendarDays size={14} className='text-foreground opacity-70' />
              <Text className='text-xs native:text-sm text-muted-foreground'>
                Fingers crossed since December 2021
              </Text>
            </View>
          </View>
        </View>
      </HoverCardContent>
    </HoverCard>
  );
}
function TeamMemberAvatar({
  name,
  initials,
  uri,
}: {
  name: string;
  initials: string;
  uri: string;
}) {
  const [isDialogOpen, setDialogOpen] = React.useState(false);
  const [isAlertDialogOpen, setAlertDialogOpen] = React.useState(false);
  return (
    <ContextMenu relativeTo='trigger'>
      <ContextMenuTrigger tabIndex={-1} className='web:cursor-default web:focus:outline-none'>
        <Avatar alt={`${name}'s avatar`}>
          <AvatarImage source={{ uri }} />
          <AvatarFallback>
            <Text>{initials}</Text>
          </AvatarFallback>
        </Avatar>
      </ContextMenuTrigger>

      <ContextMenuContent align='start' insets={contentInsets} className='w-64 native:w-72'>
        <ContextMenuItem>
          <Text>View</Text>
        </ContextMenuItem>

        <Dialog open={isDialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <ContextMenuItem closeOnPress={false}>
              <Text className='font-semibold'>Edit</Text>
            </ContextMenuItem>
          </DialogTrigger>
          <DialogContent className='sm:max-w-[425px] native:w-[385px]'>
            <DialogHeader>
              <DialogTitle>Edit profile</DialogTitle>
              <DialogDescription>
                Make changes to the profile here. Click save when you're done.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button>
                  <Text>OK</Text>
                </Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={isAlertDialogOpen} onOpenChange={setAlertDialogOpen}>
          <AlertDialogTrigger asChild>
            <ContextMenuItem closeOnPress={false}>
              <Text className='text-destructive font-semibold'>Delete</Text>
            </ContextMenuItem>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete your account and remove
                your data from our servers.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                <Text>Cancel</Text>
              </AlertDialogCancel>
              <AlertDialogAction>
                <Text>Continue</Text>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </ContextMenuContent>
    </ContextMenu>
  );
}