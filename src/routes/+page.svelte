<script lang="ts">
	import img from '$lib/images/smiling-astro.png';
	import terminus from '$lib/images/termius-icon-256.png';
	import dec from '$lib/images/DEC-new.png';
	import fcr from '$lib/images/FCR-new.png';
	import mads from '$lib/images/MADS-new.png';
</script>

<div class="bg-base-200 min-h-screen">
	<div class="hero bg-base-200 py-8 md:py-12">
		<div class="hero-content px-4 text-center">
			<div class="max-w-md sm:max-w-lg md:max-w-2xl">
				<h1 class="text-4xl font-semibold sm:text-5xl md:text-6xl">
					Enjoy driving like never before
				</h1>
				<p class="py-4 text-base sm:py-6 sm:text-lg">
					Unparalleled development principles. Stability beyond limits. Community-driven always.
				</p>
				<button class="btn btn-primary">Get Started</button>
			</div>
		</div>
	</div>
	<div class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
		<div class="mockup-browser border-base-300 rounded-3xl border shadow-2xl">
			<div class="mock palette">
				<div class="mockup-browser-toolbar">
					<div class="input">https://github.com/sunnypilot/sunnypilot</div>
				</div>
				<div class="bg-base-100 py-6">
					<div class=" grid grid-cols-1 gap-6 px-4 sm:grid-cols-2 lg:grid-cols-3">
						<div
							class="stat bg-base-100 flex flex-col items-center rounded-lg p-4 text-center shadow-sm"
						>
							<div class="stat-title text-base sm:text-lg">Total Miles</div>
							<div class="stat-value text-primary text-2xl sm:text-3xl lg:text-4xl">1.52K</div>
							<div class="stat-desc text-xs sm:text-sm">25% Higher Than Other sunnypilot Users</div>
							<div class="mt-4 w-full">
								<div class="mx-auto flex w-full max-w-xs flex-col items-center gap-4">
									<div class="skeleton h-20 w-full sm:h-24"></div>
									<div class="skeleton h-3 w-20 sm:h-4 sm:w-28"></div>
									<div class="skeleton h-3 w-full sm:h-4"></div>
									<div class="skeleton h-3 w-full sm:h-4"></div>
								</div>
								<div class="mx-auto mt-4 w-full max-w-xs space-y-2">
									<progress class="progress progress-primary w-full" value="19" max="100"
									></progress>
									<progress class="progress progress-primary w-full" value="33" max="100"
									></progress>
									<progress class="progress progress-primary w-full" value="100" max="100"
									></progress>
								</div>
							</div>
						</div>
						<div
							class="stat bg-base-100 flex flex-col items-center rounded-lg p-4 text-center shadow-sm"
						>
							<div class="stat-title text-base sm:text-lg">Total Drives</div>
							<div class="stat-value text-secondary text-2xl sm:text-3xl lg:text-4xl">2.6k</div>
							<div class="stat-desc text-xs sm:text-sm">21% more than last month</div>
							<div class="mt-4 w-full">
								<div class="mx-auto flex w-full max-w-xs flex-col items-center gap-4">
									<div class="skeleton h-20 w-full sm:h-24"></div>
									<div class="skeleton h-3 w-20 sm:h-4 sm:w-28"></div>
									<div class="skeleton h-3 w-full sm:h-4"></div>
									<div class="skeleton h-3 w-full sm:h-4"></div>
								</div>
								<div class="mx-auto mt-4 w-full max-w-xs space-y-2">
									<progress class="progress progress-primary w-full" value="22" max="100"
									></progress>
									<progress class="progress progress-primary w-full" value="98" max="100"
									></progress>
									<progress class="progress progress-primary w-full" value="100" max="100"
									></progress>
								</div>
							</div>
						</div>
						<div
							class="stat bg-base-100 flex flex-col items-center rounded-lg p-4 text-center shadow-sm"
						>
							<div class="stat-value text-2xl sm:text-3xl lg:text-4xl">86%</div>
							<div class="stat-title text-base sm:text-lg">Engagement Rating</div>
							<div class="stat-desc text-secondary text-xs sm:text-sm">
								23% more than last month
							</div>
							<div class="mt-4 w-full">
								<div class="mx-auto flex w-full max-w-xs flex-col items-center gap-4">
									<div class="skeleton h-20 w-full sm:h-24"></div>
									<div class="skeleton h-3 w-20 sm:h-4 sm:w-28"></div>
									<div class="skeleton h-3 w-full sm:h-4"></div>
									<div class="skeleton h-3 w-full sm:h-4"></div>
								</div>
								<div class="mx-auto mt-4 w-full max-w-xs space-y-2">
									<progress class="progress progress-primary w-full" value="62" max="100"
									></progress>
									<progress class="progress progress-primary w-full" value="15" max="100"
									></progress>
									<progress class="progress progress-primary w-full" value="100" max="100"
									></progress>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
	<div class="mx-auto w-full py-6 text-center">
		<div class="badge badge-soft badge-success badge-xl">Features</div>
	</div>
	<div
		class="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-3 lg:px-8"
	>
		<div class="card bg-base-100 w-full shadow-sm">
			<figure class="px-6 pt-6">
				<img src={dec} alt="dec" class="w-full rounded-xl" />
			</figure>
			<div class="card-body items-center text-center">
				<h2 class="card-title h-16 text-xl">Dynamic Experimental Control</h2>
				<p class="text-sm">
					Seamlessly switch between ACC and Experimental Mode for smooth longitudinal control. Enjoy
					better stopping at red lights and stop signs while keeping your set speed elsewhere. This
					smart feature optimizes your driving experience effortlessly.
				</p>
			</div>
		</div>
		<div class="card bg-base-100 w-full shadow-sm">
			<figure class="px-6 pt-6">
				<img src={mads} alt="mads" class="w-full rounded-xl" />
			</figure>
			<div class="card-body items-center text-center">
				<h2 class="card-title h-16 text-xl">MADS</h2>
				<p class="text-sm">
					Toggle Lateral and Longitudinal Control independently! Let your vehicle steer while you
					handle gas and brake, or let it manage acceleration and braking while you steer. This
					flexibility enhances your driving control seamlessly.
				</p>
			</div>
		</div>
		<div class="card bg-base-100 w-full shadow-sm">
			<figure class="px-6 pt-6">
				<img src={fcr} alt="fcr" class="w-full rounded-xl" />
			</figure>
			<div class="card-body items-center text-center">
				<h2 class="card-title h-16 text-xl">Forced Car Recognition</h2>
				<p class="text-sm">
					Eliminate issues from ECU updates after recalls or OTAs! Forced Car Recognition ensures
					sunnypilot identifies your vehicle at every start. Avoid frustrating mornings when your
					car isn’t detected due to software changes effortlessly.
				</p>
			</div>
		</div>
	</div>
	<div class="mx-auto w-full py-6 text-center">
		<div class="badge badge-soft badge-info badge-xl">Branch Info</div>
	</div>
	<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
		<div class="tabs tabs-box p-5">
			<input type="radio" name="my_tabs_6" class="tab" aria-label="Release" checked />
			<div class="tab-content bg-base-100 border-base-300 p-6">
				<div class="mockup-window bg-base-100 border-base-300 border">
					<div class="px-4 py-6 sm:px-6 lg:px-10">
						<h1 class="text-2xl font-bold sm:text-3xl">Why use release?</h1>
						<ol class="list-inside list-decimal text-sm sm:text-base">
							<li>
								Stability! The Release branch is our most consistent, with a nonzero probability of
								introducing regressions. We've spent considerable resources developing a strong
								suite of CI tests to ensure the best for all of our users
							</li>
							<li class="pt-2">
								If a regression does ship, it's all hands on deck! Release regressions are rare, but
								we're not perfect. When we do ship these, we ensure that <span class="font-bold"
									>someone</span
								> addresses these issues immediately.
							</li>
							<li class="pt-2">
								Stress-free! Experience stress-free updates with our release branch—each feature is
								thoroughly verified by trusted testers and our community, ensuring it's ready for
								immediate use without sacrificing stability.
							</li>
						</ol>
						<p class="pt-4 text-sm sm:text-base">
							Ready to experience the most stable sunnypilot version?
						</p>
						<p class="text-sm sm:text-base">
							On your Comma 3X device, select "Custom Software" and input <code
								>sunnypilot/release-c3-new</code
							>
						</p>
					</div>
				</div>
			</div>

			<input type="radio" name="my_tabs_6" class="tab" aria-label="Staging" />
			<div class="tab-content bg-base-100 border-base-300 p-6">
				<div class="mockup-window bg-base-100 border-base-300 border">
					<div class="px-4 py-6 sm:px-6 lg:px-10">
						<h1 class="text-2xl font-bold sm:text-3xl">...then what's staging for?</h1>
						<ol class="list-inside list-decimal text-sm sm:text-base">
							<li>
								Cautious Adventurers! The staging branch gives you a sneak peek at upcoming features
								that have undergone preliminary testing. It's for those who want to explore new
								innovations early, knowing they're still getting refined.
							</li>
							<li class="pt-2">
								Test-Дrive Innovation! Experience early updates in our staging environment—each new
								feature gets an initial round of testing by a group of trusted testers and community
								members. This lets you explore fresh functionality while helping us catch and
								resolve any issues before the final release.
							</li>
						</ol>
						<p class="pt-4 text-sm sm:text-base">
							Ready to experience near bleeding-edge sunnypilot version?
						</p>
						<p class="text-sm sm:text-base">
							On your Comma 3X device, select "Custom Software" and input <code
								>sunnypilot/staging-c3-new</code
							>
						</p>
					</div>
				</div>
			</div>

			<input type="radio" name="my_tabs_6" class="tab" aria-label="Dev" />
			<div class="tab-content bg-base-100 border-base-300 p-6">
				<div class="mockup-window bg-base-100 border-base-300 border">
					<div class="px-4 py-6 sm:px-6 lg:px-10">
						<h1 class="text-2xl font-bold sm:text-3xl">Wait! Why dev then?</h1>
						<ol class="list-inside list-decimal text-sm sm:text-base">
							<li>
								ABSOLUTE MADMEN! The dev branch is our playground. We develop new features and ship
								often. We break things sometimes (YOU HAVE TO BREAK EGGS TO MAKE AN OMELTTE), but
								we're pretty adamant on trying not to do that. We ship new features as often as we
								can and refine existing ones constantly.
							</li>
							<li class="pt-2">
								You want to help shape <span class="font-bold">sunnypilot</span>! We take community
								feedback as serious as internal feedback. A lot of features, improvements and
								quality-of-life upgrades have stemmed from discussions with your community members.
								This allows you to drive the ship and help us identify where we should put our
								resources!
							</li>
						</ol>
						<p class="pt-4 text-sm sm:text-base">
							Ready to experience the most fun sunnypilot version?
						</p>
						<p class="text-sm sm:text-base">
							On your Comma 3X device, select "Custom Software" and input <code
								>sunnypilot/dev-c3-new</code
							>
						</p>
					</div>
				</div>
			</div>
		</div>
	</div>
	<div class="mx-auto w-full py-6 text-center">
		<div class="badge badge-soft badge-primary badge-xl">FAQ</div>
	</div>
	<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
		<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
			<img src={img} alt="astronaut" class="mx-auto w-full max-w-md bg-transparent lg:max-w-full" />
			<div class="p-4 sm:p-6">
				<details class="bg-base-100 border-base-300 collapse border">
					<summary class="collapse-title text-base font-semibold sm:text-lg"
						>What is sunnypilot?</summary
					>
					<div class="collapse-content text-sm sm:text-base">
						sunnypilot is an open-source driving assistance software designed to enhance the driving
						experience by providing features like Modified Assistive Driving Safety (MADS), Forced
						Car Recognition (FCR), Dynamic Experimental Control (DEC) and many other quality-of-life
						features
					</div>
				</details>
				<details class="bg-base-100 border-base-300 collapse mt-2 border">
					<summary class="collapse-title text-base font-semibold sm:text-lg"
						>Which driving models are best for heavy traffic?
					</summary>
					<div class="collapse-content text-sm sm:text-base">
						Well, it depends. This is personal preference so we recommend trying a vareity of
						models. However, Filet o' Fish has been regarded as one of the better models as of late
						and is regarded as much better at longitudinal control than previous models so maybe
						start with this one.
					</div>
				</details>
				<details class="bg-base-100 border-base-300 collapse mt-2 border">
					<summary class="collapse-title text-base font-semibold sm:text-lg"
						>How do I leave feedback for the sunnypilot team?
					</summary>
					<div class="collapse-content text-sm sm:text-base">
						You can leave feedback by joining the official sunnypilot <a
							class="text-blue-500"
							href="https://discord.gg/7wq8zuxB">Discord</a
						> server. Feel free to ping any of the moderators or any of the devs on the team!
					</div>
				</details>
				<details class="bg-base-100 border-base-300 collapse mt-2 border">
					<summary class="collapse-title text-base font-semibold sm:text-lg"
						>Where can I find documentation and support for sunnypilot?
					</summary>
					<div class="collapse-content text-sm sm:text-base">
						The best place to find documentation and support will be the official sunnypilot <a
							class="text-blue-500"
							href="https://discord.gg/7wq8zuxB">Discord</a
						> server. There will be better places in the not-so-distant future but for now, this is the
						best place. We have a community willing and able to provide support and for anything they
						can't answer, our incredibly talented dev team is happy to help.
					</div>
				</details>
				<details class="bg-base-100 border-base-300 collapse mt-2 border">
					<summary class="collapse-title text-base font-semibold sm:text-lg"
						>There's a lot of settings. Where do I get started?</summary
					>
					<div class="collapse-content text-sm sm:text-base">
						There is a lot of settings! We've done a lot of work to try to curate our settings to a
						wide audience so it may seem overwhelming at first. We suggest installing sunnypilot and
						ensuring it's enabled. Drive like this for a few weeks and then start going through the
						settings again after knowing how stock sunnypilot drives. From there, if you tap each
						setting a description will be displayed! We're working on bringing back our online
						portal for setting your preferences from device, so be on the lookout!
					</div>
				</details>
			</div>
		</div>
	</div>
	<div class="mx-auto">
		<div class="mx-auto w-full py-6 text-center">
			<div class="badge badge-soft badge-accent badge-xl">SPONSORS</div>
			<p class="text-sm font-semibold">
				We're so thankful for all our sponsors. You enable us to do everything. From the bottom of
				our hearts, thank you!
			</p>
		</div>
		<div class="flex justify-center pb-5">
			<div>
				<div class="avatar">
					<div class="w-24 rounded-4xl">
						<a href="https://termius.com/"> <img src={terminus} alt="terminus logo" /></a>
					</div>
				</div>
				<p class="text-center text-2xl">Termius</p>
			</div>
		</div>
	</div>
</div>
